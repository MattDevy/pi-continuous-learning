import { existsSync } from "node:fs";
import { join } from "node:path";
import type { PackageInfo } from "../types.js";
import { readTextFile, readJsonFile } from "../fs-utils.js";

export function detectPackages(cwd: string): readonly PackageInfo[] {
  const results: PackageInfo[] = [];

  const npmPkg = readJsonFile(join(cwd, "package.json"));
  if (npmPkg) {
    const deps = Object.keys(npmPkg.dependencies ?? {});
    const devDeps = Object.keys(npmPkg.devDependencies ?? {});
    const name = typeof npmPkg.name === "string" ? npmPkg.name : "";
    const version = typeof npmPkg.version === "string" ? npmPkg.version : null;
    results.push({
      manager: "npm",
      name,
      ...(version ? { version } : {}),
      dependencies: [...deps, ...devDeps],
    });
  }

  const goMod = readTextFile(join(cwd, "go.mod"));
  if (goMod) {
    const moduleMatch = goMod.match(/^module\s+(\S+)/m);
    const deps = [...goMod.matchAll(/^\t(\S+)\s/gm)].map((m) => m[1]!);
    results.push({
      manager: "go",
      name: moduleMatch?.[1] ?? "",
      dependencies: deps,
    });
  }

  const cargo = readTextFile(join(cwd, "Cargo.toml"));
  if (cargo) {
    const nameMatch = cargo.match(/^name\s*=\s*"([^"]+)"/m);
    const versionMatch = cargo.match(/^version\s*=\s*"([^"]+)"/m);
    const deps = [...cargo.matchAll(/^\[(?:dev-)?dependencies\.([^\]]+)\]/gm)].map((m) => m[1]!);
    const inlineDeps = [...cargo.matchAll(/^(\w[\w-]*)\s*=\s*(?:"|{)/gm)]
      .map((m) => m[1]!)
      .filter((d) => d !== "name" && d !== "version" && d !== "edition" && d !== "authors");
    const cargoVersion = versionMatch?.[1];
    results.push({
      manager: "cargo",
      name: nameMatch?.[1] ?? "",
      ...(cargoVersion ? { version: cargoVersion } : {}),
      dependencies: [...new Set([...deps, ...inlineDeps])],
    });
  }

  const pyproject = readTextFile(join(cwd, "pyproject.toml"));
  if (pyproject) {
    const nameMatch = pyproject.match(/^name\s*=\s*"([^"]+)"/m);
    const versionMatch = pyproject.match(/^version\s*=\s*"([^"]+)"/m);
    const depsSection = pyproject.match(/^dependencies\s*=\s*\[([\s\S]*?)\]/m);
    const deps = depsSection
      ? [...depsSection[1]!.matchAll(/"([^">=<\s]+)/g)].map((m) => m[1]!)
      : [];
    const hasPoetry = pyproject.includes("[tool.poetry]");
    const pyVersion = versionMatch?.[1];
    results.push({
      manager: hasPoetry ? "poetry" : "pip",
      name: nameMatch?.[1] ?? "",
      ...(pyVersion ? { version: pyVersion } : {}),
      dependencies: deps,
    });
  }

  const composer = readJsonFile(join(cwd, "composer.json"));
  if (composer) {
    results.push({
      manager: "composer",
      name: typeof composer.name === "string" ? composer.name : "",
      dependencies: Object.keys(composer.require ?? {}),
    });
  }

  if (existsSync(join(cwd, "build.gradle")) || existsSync(join(cwd, "build.gradle.kts"))) {
    results.push({ manager: "gradle", name: "", dependencies: [] });
  }

  if (existsSync(join(cwd, "pom.xml"))) {
    results.push({ manager: "maven", name: "", dependencies: [] });
  }

  return results;
}
