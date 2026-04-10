import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectEntryPoints } from "./entry-point-detector.js";
import type { PackageInfo } from "../types.js";

const tmpBase = mkdtempSync(join(tmpdir(), "compass-entry-test-"));

afterAll(() => {
  rmSync(tmpBase, { recursive: true, force: true });
});

function setup(name: string, files: string[]): string {
  const dir = join(tmpBase, name);
  for (const file of files) {
    const full = join(dir, file);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, "");
  }
  return dir;
}

const npmPkg: PackageInfo = { manager: "npm", name: "test", dependencies: [] };

describe("detectEntryPoints", () => {
  it("detects src/index.ts", () => {
    const dir = setup("ts-index", ["src/index.ts"]);
    const points = detectEntryPoints(dir, []);
    expect(points.map((p) => p.path)).toContain("src/index.ts");
  });

  it("detects main field from package.json", () => {
    const dir = setup("main-field", ["src/index.ts"]);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ main: "./dist/index.js" }));
    const points = detectEntryPoints(dir, [npmPkg]);
    expect(points.map((p) => p.path)).toContain("./dist/index.js");
  });

  it("detects route directories", () => {
    const dir = setup("routes", ["src/routes/api.ts", "src/index.ts"]);
    const points = detectEntryPoints(dir, []);
    expect(points.map((p) => p.path)).toContain("src/routes");
  });

  it("detects config files", () => {
    const dir = setup("config", ["next.config.js", "src/index.ts"]);
    const points = detectEntryPoints(dir, []);
    expect(points.map((p) => p.path)).toContain("next.config.js");
  });

  it("detects Go entry point", () => {
    const dir = setup("go", ["main.go"]);
    const points = detectEntryPoints(dir, []);
    expect(points.map((p) => p.path)).toContain("main.go");
  });

  it("detects Python entry point", () => {
    const dir = setup("py", ["manage.py"]);
    const points = detectEntryPoints(dir, []);
    expect(points.map((p) => p.path)).toContain("manage.py");
  });

  it("returns empty for no matches", () => {
    const dir = setup("empty", ["docs/readme.txt"]);
    expect(detectEntryPoints(dir, [])).toEqual([]);
  });
});
