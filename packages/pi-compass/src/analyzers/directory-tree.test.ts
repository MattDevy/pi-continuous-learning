import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDirectoryTree, formatDirectoryTree } from "./directory-tree.js";

const tmpBase = mkdtempSync(join(tmpdir(), "compass-tree-test-"));

afterAll(() => {
  rmSync(tmpBase, { recursive: true, force: true });
});

function setupProject(name: string, structure: Record<string, string | null>): string {
  const dir = join(tmpBase, name);
  mkdirSync(dir, { recursive: true });
  for (const [path, content] of Object.entries(structure)) {
    const fullPath = join(dir, path);
    if (content === null) {
      mkdirSync(fullPath, { recursive: true });
    } else {
      mkdirSync(join(fullPath, ".."), { recursive: true });
      writeFileSync(fullPath, content);
    }
  }
  return dir;
}

describe("buildDirectoryTree", () => {
  it("lists files and directories", () => {
    const dir = setupProject("basic", {
      "src/index.ts": "export {}",
      "package.json": "{}",
      "README.md": "# test",
    });
    const tree = buildDirectoryTree(dir);
    const names = tree.map((e) => e.name);
    expect(names).toContain("src");
    expect(names).toContain("package.json");
    expect(names).toContain("README.md");
  });

  it("excludes node_modules and .git", () => {
    const dir = setupProject("ignored", {
      "src/index.ts": "",
      "node_modules/foo/index.js": "",
      ".git/HEAD": "",
    });
    const tree = buildDirectoryTree(dir);
    const names = tree.map((e) => e.name);
    expect(names).not.toContain("node_modules");
    expect(names).not.toContain(".git");
  });

  it("includes .github directory", () => {
    const dir = setupProject("github", {
      ".github/workflows/ci.yml": "name: CI",
    });
    const tree = buildDirectoryTree(dir);
    expect(tree.map((e) => e.name)).toContain(".github");
  });

  it("respects depth limit", () => {
    const dir = setupProject("deep", {
      "a/b/c/d.txt": "deep",
    });
    const tree = buildDirectoryTree(dir, 1);
    const aEntry = tree.find((e) => e.name === "a");
    expect(aEntry?.children).toBeUndefined();
  });

  it("includes children at depth 2", () => {
    const dir = setupProject("depth2", {
      "src/index.ts": "",
      "src/utils/helper.ts": "",
    });
    const tree = buildDirectoryTree(dir, 2);
    const src = tree.find((e) => e.name === "src");
    expect(src?.children).toBeDefined();
    expect(src!.children!.map((c) => c.name)).toContain("index.ts");
  });
});

describe("formatDirectoryTree", () => {
  it("formats a simple tree", () => {
    const tree = [
      { name: "src", type: "dir" as const, children: [{ name: "index.ts", type: "file" as const }] },
      { name: "package.json", type: "file" as const },
    ];
    const output = formatDirectoryTree(tree);
    expect(output).toContain("src/");
    expect(output).toContain("index.ts");
    expect(output).toContain("package.json");
  });
});
