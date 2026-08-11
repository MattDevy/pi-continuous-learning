import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { undeclaredImports } from "./check-packed-packages.mjs";

async function fixture(files, manifest = {}) {
  const directory = await mkdtemp(join(tmpdir(), "package-import-fixture-"));
  await mkdir(join(directory, "dist"));
  await Promise.all(
    Object.entries(files).map(([name, contents]) =>
      writeFile(join(directory, "dist", name), contents),
    ),
  );
  return {
    directory,
    manifest: { name: "fixture", ...manifest },
  };
}

test("reports undeclared imports from every emitted JavaScript extension", async (t) => {
  const example = await fixture({
    "index.js": 'import "missing-js";',
    "module.mjs": 'export { value } from "missing-mjs";',
    "common.cjs": 'require("missing-cjs");',
  });
  t.after(() => rm(example.directory, { recursive: true, force: true }));

  const findings = await undeclaredImports(example.directory, example.manifest);

  assert.deepEqual(
    findings.map((finding) => finding.split(" imports ")[1]).sort(),
    ["missing-cjs", "missing-js", "missing-mjs"],
  );
});

test("reports static dynamic-import and require.resolve forms", async (t) => {
  const example = await fixture({
    "index.js": [
      "await import(`missing-template`);",
      'await import("missing-options", { with: { type: "json" } });',
      'require.resolve("missing-resolve");',
    ].join("\n"),
  });
  t.after(() => rm(example.directory, { recursive: true, force: true }));

  const findings = await undeclaredImports(example.directory, example.manifest);

  assert.deepEqual(
    findings.map((finding) => finding.split(" imports ")[1]).sort(),
    ["missing-options", "missing-resolve", "missing-template"],
  );
});

test("allows builtins, local files, runtime dependencies, optional dependencies, and peers", async (t) => {
  const example = await fixture(
    {
      "index.js": [
        'import "node:path";',
        'import "./local.js";',
        'import "runtime/subpath";',
        'import "@scope/optional/subpath";',
        'import "peer";',
      ].join("\n"),
    },
    {
      dependencies: { runtime: "1.0.0" },
      optionalDependencies: { "@scope/optional": "1.0.0" },
      peerDependencies: { peer: "1.0.0" },
    },
  );
  t.after(() => rm(example.directory, { recursive: true, force: true }));

  assert.deepEqual(await undeclaredImports(example.directory, example.manifest), []);
});
