import { builtinModules } from "node:module";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packagesDir = join(rootDir, "packages");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const builtins = new Set(
  builtinModules.flatMap((name) => [name, name.replace(/^node:/, "")]),
);

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`${command} ${args.join(" ")} failed`);
  }

  return result.stdout;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function findJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return findJavaScriptFiles(path);
      return entry.isFile() && /\.(?:c|m)?js$/.test(entry.name) ? [path] : [];
    }),
  );
  return files.flat();
}

function importedSpecifier(node) {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier.text;
  }

  if (ts.isCallExpression(node) && node.arguments.length > 0) {
    const [firstArgument] = node.arguments;
    const isImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
    const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
    const isRequireResolve =
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "require" &&
      node.expression.name.text === "resolve";

    if ((isImport || isRequire || isRequireResolve) && ts.isStringLiteralLike(firstArgument)) {
      return firstArgument.text;
    }
  }

  return undefined;
}

function externalPackageName(specifier) {
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("#") ||
    specifier.includes(":") ||
    builtins.has(specifier)
  ) {
    return undefined;
  }

  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

export async function undeclaredImports(packageDir, manifest) {
  const declared = new Set([
    manifest.name,
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);
  const findings = [];

  for (const file of await findJavaScriptFiles(join(packageDir, "dist"))) {
    const source = ts.createSourceFile(
      file,
      await readFile(file, "utf8"),
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.JS,
    );

    function visit(node) {
      const specifier = importedSpecifier(node);
      const packageName = specifier && externalPackageName(specifier);
      if (packageName && !declared.has(packageName)) {
        findings.push(`${file.slice(rootDir.length + 1)} imports ${specifier}`);
      }
      ts.forEachChild(node, visit);
    }

    visit(source);
  }

  return findings;
}

async function packageDirectories(requested) {
  if (requested.length > 0) {
    return requested.map((directory) => resolve(rootDir, directory));
  }

  const entries = await readdir(packagesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packagesDir, entry.name))
    .sort();
}

function pack(packageDir, destination) {
  const output = run(
    npmCommand,
    ["pack", packageDir, "--json", "--pack-destination", destination],
    rootDir,
  );
  const [{ filename }] = JSON.parse(output);
  return join(destination, filename);
}

async function installPackage(tarball, manifest, temporaryRoot) {
  const installDir = join(temporaryRoot, `${encodeURIComponent(manifest.name)}-install`);
  await mkdir(installDir);
  await writeFile(
    join(installDir, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  run(
    npmCommand,
    [
      "install",
      tarball,
      "--omit=dev",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
    ],
    installDir,
  );
  const installedPackageDir = join(installDir, "node_modules", manifest.name);
  return {
    installDir,
    packageDir: installedPackageDir,
    manifest: await readJson(join(installedPackageDir, "package.json")),
  };
}

function smokeTest(installDir, manifest) {
  const entrypoints = [...new Set(manifest.pi?.extensions ?? [])];
  const smokeScript = `
    import { pathToFileURL } from "node:url";
    import { resolve } from "node:path";
    const packageDir = resolve("node_modules", process.env.PACKAGE_NAME);
    if (process.env.PACKAGE_HAS_MAIN === "true") {
      await import(process.env.PACKAGE_NAME);
    }
    for (const entrypoint of JSON.parse(process.env.PACKAGE_ENTRYPOINTS)) {
      await import(pathToFileURL(resolve(packageDir, entrypoint)));
    }
  `;
  run(process.execPath, ["--input-type=module", "--eval", smokeScript], installDir, {
    ...process.env,
    PACKAGE_NAME: manifest.name,
    PACKAGE_HAS_MAIN: String(Boolean(manifest.main || manifest.exports)),
    PACKAGE_ENTRYPOINTS: JSON.stringify(entrypoints),
  });
}

function parseArguments(args) {
  const destinationArgument = args.find((arg) => arg.startsWith("--pack-destination="));
  return {
    requested: args.filter((arg) => !arg.startsWith("--pack-destination=")),
    destination: destinationArgument
      ? resolve(rootDir, destinationArgument.split("=", 2)[1])
      : undefined,
  };
}

async function main(args) {
  const { requested, destination } = parseArguments(args);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "pi-package-check-"));
  const packDestination = destination ?? join(temporaryRoot, "tarballs");

  try {
    await mkdir(packDestination, { recursive: true });
    for (const packageDir of await packageDirectories(requested)) {
      const workspaceManifest = await readJson(join(packageDir, "package.json"));
      const tarball = pack(packageDir, packDestination);
      const installed = await installPackage(tarball, workspaceManifest, temporaryRoot);
      const findings = await undeclaredImports(installed.packageDir, installed.manifest);
      if (findings.length > 0) {
        throw new Error(
          `${installed.manifest.name} has undeclared runtime imports:\n${findings.join("\n")}`,
        );
      }

      smokeTest(installed.installDir, installed.manifest);
      console.log(`✓ ${installed.manifest.name}: ${basename(tarball)}`);
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) await main(process.argv.slice(2));
