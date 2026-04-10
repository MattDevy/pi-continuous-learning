import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectBuildScripts } from "./build-script-detector.js";

const tmpBase = mkdtempSync(join(tmpdir(), "compass-build-test-"));

afterAll(() => {
  rmSync(tmpBase, { recursive: true, force: true });
});

function makeDir(name: string): string {
  const dir = join(tmpBase, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("detectBuildScripts", () => {
  it("extracts npm scripts from package.json", () => {
    const dir = makeDir("npm-scripts");
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      scripts: { build: "tsc", test: "vitest", dev: "next dev", random: "echo hi" },
    }));
    const scripts = detectBuildScripts(dir);
    const names = scripts.map((s) => s.name);
    expect(names).toContain("build");
    expect(names).toContain("test");
    expect(names).toContain("dev");
    expect(names).not.toContain("random");
  });

  it("extracts Makefile targets", () => {
    const dir = makeDir("makefile");
    writeFileSync(join(dir, "Makefile"), `build:
\tgo build ./...

test:
\tgo test ./...

.PHONY: build test
`);
    const scripts = detectBuildScripts(dir);
    expect(scripts.map((s) => s.name)).toContain("build");
    expect(scripts.map((s) => s.name)).toContain("test");
  });

  it("detects GitHub Actions", () => {
    const dir = makeDir("ci-gh");
    mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
    writeFileSync(join(dir, ".github", "workflows", "ci.yml"), "name: CI");
    const scripts = detectBuildScripts(dir);
    expect(scripts.find((s) => s.source === ".github/workflows/")).toBeDefined();
  });

  it("detects Dockerfile", () => {
    const dir = makeDir("docker");
    writeFileSync(join(dir, "Dockerfile"), "FROM node:18");
    const scripts = detectBuildScripts(dir);
    expect(scripts.find((s) => s.name === "docker")).toBeDefined();
  });

  it("returns empty for bare directory", () => {
    const dir = makeDir("bare");
    expect(detectBuildScripts(dir)).toEqual([]);
  });
});
