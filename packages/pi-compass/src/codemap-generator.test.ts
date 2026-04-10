import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateCodemap, computeContentHash, getOrGenerateCodemap } from "./codemap-generator.js";
import { ensureStorageLayout } from "./storage.js";

const tmpBase = mkdtempSync(join(tmpdir(), "compass-gen-test-"));

afterAll(() => {
  rmSync(tmpBase, { recursive: true, force: true });
});

function setupProject(name: string, files: Record<string, string>): string {
  const dir = join(tmpBase, name);
  mkdirSync(dir, { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

describe("computeContentHash", () => {
  it("produces a 16-char hex hash", () => {
    const dir = setupProject("hash-basic", { "package.json": "{}" });
    const hash = computeContentHash(dir);
    expect(hash).toHaveLength(16);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("produces different hashes for different content", () => {
    const dir1 = setupProject("hash-a", { "package.json": '{"name":"a"}' });
    const dir2 = setupProject("hash-b", { "package.json": '{"name":"b"}' });
    expect(computeContentHash(dir1)).not.toBe(computeContentHash(dir2));
  });

  it("produces same hash for same content", () => {
    const dir = setupProject("hash-stable", { "package.json": '{"name":"x"}' });
    expect(computeContentHash(dir)).toBe(computeContentHash(dir));
  });
});

describe("generateCodemap", () => {
  it("generates a complete codemap", () => {
    const dir = setupProject("gen-full", {
      "package.json": JSON.stringify({
        name: "test-app",
        version: "1.0.0",
        dependencies: { react: "^18.0.0" },
        scripts: { build: "tsc", test: "vitest" },
      }),
      "src/index.ts": "export {}",
      "README.md": "# Test",
    });
    const map = generateCodemap(dir, "proj-1", "test-app");
    expect(map.projectId).toBe("proj-1");
    expect(map.projectName).toBe("test-app");
    expect(map.contentHash).toHaveLength(16);
    expect(map.packages.length).toBeGreaterThan(0);
    expect(map.frameworks.map((f) => f.name)).toContain("React");
    expect(map.entryPoints.map((e) => e.path)).toContain("src/index.ts");
    expect(map.keyFiles.map((k) => k.path)).toContain("README.md");
    expect(map.buildScripts.map((s) => s.name)).toContain("build");
  });
});

describe("getOrGenerateCodemap", () => {
  it("generates on first call", () => {
    const cacheDir = join(tmpBase, "cache-first");
    ensureStorageLayout("gen-first", cacheDir);
    const dir = setupProject("get-first", { "package.json": '{"name":"x"}' });
    const result = getOrGenerateCodemap(dir, "gen-first", "x", cacheDir);
    expect(result.fromCache).toBe(false);
    expect(result.stale).toBe(false);
  });

  it("returns cached on second call", () => {
    const cacheDir = join(tmpBase, "cache-second");
    ensureStorageLayout("gen-second", cacheDir);
    const dir = setupProject("get-second", { "package.json": '{"name":"y"}' });
    getOrGenerateCodemap(dir, "gen-second", "y", cacheDir);
    const result = getOrGenerateCodemap(dir, "gen-second", "y", cacheDir);
    expect(result.fromCache).toBe(true);
    expect(result.stale).toBe(false);
  });

  it("detects stale cache when content changes", () => {
    const cacheDir = join(tmpBase, "cache-stale");
    ensureStorageLayout("gen-stale", cacheDir);
    const dir = setupProject("get-stale", { "package.json": '{"name":"z"}' });
    getOrGenerateCodemap(dir, "gen-stale", "z", cacheDir);

    writeFileSync(join(dir, "package.json"), '{"name":"z","version":"2.0.0"}');
    const result = getOrGenerateCodemap(dir, "gen-stale", "z", cacheDir);
    expect(result.fromCache).toBe(true);
    expect(result.stale).toBe(true);
  });
});
