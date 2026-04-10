import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectPackages } from "./package-detector.js";

const tmpBase = mkdtempSync(join(tmpdir(), "compass-pkg-test-"));

afterAll(() => {
  rmSync(tmpBase, { recursive: true, force: true });
});

function makeDir(name: string): string {
  const dir = join(tmpBase, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("detectPackages", () => {
  it("detects npm package from package.json", () => {
    const dir = makeDir("npm");
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "my-app",
      version: "1.0.0",
      dependencies: { react: "^18.0.0" },
      devDependencies: { vitest: "^3.0.0" },
    }));
    const pkgs = detectPackages(dir);
    expect(pkgs).toHaveLength(1);
    expect(pkgs[0]?.manager).toBe("npm");
    expect(pkgs[0]?.name).toBe("my-app");
    expect(pkgs[0]?.dependencies).toContain("react");
    expect(pkgs[0]?.dependencies).toContain("vitest");
  });

  it("detects go module from go.mod", () => {
    const dir = makeDir("go");
    writeFileSync(join(dir, "go.mod"), `module github.com/user/app

go 1.21

require (
\tgithub.com/gin-gonic/gin v1.9.0
\tgithub.com/joho/godotenv v1.5.1
)
`);
    const pkgs = detectPackages(dir);
    expect(pkgs).toHaveLength(1);
    expect(pkgs[0]?.manager).toBe("go");
    expect(pkgs[0]?.name).toBe("github.com/user/app");
    expect(pkgs[0]?.dependencies).toContain("github.com/gin-gonic/gin");
  });

  it("detects pyproject.toml", () => {
    const dir = makeDir("python");
    writeFileSync(join(dir, "pyproject.toml"), `[project]
name = "my-app"
version = "0.1.0"
dependencies = [
  "django>=4.0",
  "celery>=5.0",
]
`);
    const pkgs = detectPackages(dir);
    expect(pkgs).toHaveLength(1);
    expect(pkgs[0]?.manager).toBe("pip");
    expect(pkgs[0]?.dependencies).toContain("django");
  });

  it("detects poetry project", () => {
    const dir = makeDir("poetry");
    writeFileSync(join(dir, "pyproject.toml"), `[tool.poetry]
name = "my-app"
version = "0.1.0"
`);
    const pkgs = detectPackages(dir);
    expect(pkgs[0]?.manager).toBe("poetry");
  });

  it("returns empty for empty directory", () => {
    const dir = makeDir("empty");
    expect(detectPackages(dir)).toEqual([]);
  });

  it("detects multiple package managers", () => {
    const dir = makeDir("multi");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "frontend" }));
    writeFileSync(join(dir, "go.mod"), "module backend\n");
    const pkgs = detectPackages(dir);
    expect(pkgs).toHaveLength(2);
  });
});
