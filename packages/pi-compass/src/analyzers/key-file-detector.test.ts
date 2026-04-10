import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectKeyFiles } from "./key-file-detector.js";

const tmpBase = mkdtempSync(join(tmpdir(), "compass-key-test-"));

afterAll(() => {
  rmSync(tmpBase, { recursive: true, force: true });
});

function setup(name: string, files: string[]): string {
  const dir = join(tmpBase, name);
  mkdirSync(dir, { recursive: true });
  for (const file of files) {
    const full = join(dir, file);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, "");
  }
  return dir;
}

describe("detectKeyFiles", () => {
  it("detects README and LICENSE", () => {
    const dir = setup("basic", ["README.md", "LICENSE"]);
    const keys = detectKeyFiles(dir);
    expect(keys.map((k) => k.path)).toContain("README.md");
    expect(keys.map((k) => k.path)).toContain("LICENSE");
  });

  it("detects Dockerfile and docker-compose", () => {
    const dir = setup("docker", ["Dockerfile", "docker-compose.yml"]);
    const keys = detectKeyFiles(dir);
    expect(keys.map((k) => k.path)).toContain("Dockerfile");
    expect(keys.map((k) => k.path)).toContain("docker-compose.yml");
  });

  it("detects GitHub workflows directory", () => {
    const dir = setup("ci", [".github/workflows/ci.yml"]);
    const keys = detectKeyFiles(dir);
    expect(keys.map((k) => k.path)).toContain(".github/workflows");
  });

  it("detects AI agent files", () => {
    const dir = setup("ai", ["AGENTS.md", "CLAUDE.md"]);
    const keys = detectKeyFiles(dir);
    expect(keys.map((k) => k.path)).toContain("AGENTS.md");
    expect(keys.map((k) => k.path)).toContain("CLAUDE.md");
  });

  it("returns empty for bare directory", () => {
    const dir = setup("empty", []);
    expect(detectKeyFiles(dir)).toEqual([]);
  });
});
