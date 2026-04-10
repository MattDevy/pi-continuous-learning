import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectConventions } from "./convention-detector.js";

const tmpBase = mkdtempSync(join(tmpdir(), "compass-conv-test-"));

afterAll(() => {
  rmSync(tmpBase, { recursive: true, force: true });
});

function makeDir(name: string): string {
  const dir = join(tmpBase, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("detectConventions", () => {
  it("reads AGENTS.md", () => {
    const dir = makeDir("agents");
    writeFileSync(join(dir, "AGENTS.md"), "# Conventions\n\nUse TDD.");
    const convs = detectConventions(dir);
    expect(convs.find((c) => c.source === "AGENTS.md")).toBeDefined();
    expect(convs.find((c) => c.source === "AGENTS.md")?.content).toContain("TDD");
  });

  it("reads CLAUDE.md", () => {
    const dir = makeDir("claude");
    writeFileSync(join(dir, "CLAUDE.md"), "# Commands\n\nnpm test");
    const convs = detectConventions(dir);
    expect(convs.find((c) => c.source === "CLAUDE.md")).toBeDefined();
  });

  it("reads .editorconfig", () => {
    const dir = makeDir("editor");
    writeFileSync(join(dir, ".editorconfig"), "root = true\n[*]\nindent_style = space");
    const convs = detectConventions(dir);
    expect(convs.find((c) => c.source === ".editorconfig")).toBeDefined();
  });

  it("truncates large files", () => {
    const dir = makeDir("large");
    writeFileSync(join(dir, "AGENTS.md"), "x".repeat(5000));
    const convs = detectConventions(dir);
    const agents = convs.find((c) => c.source === "AGENTS.md");
    expect(agents!.content.length).toBeLessThan(5000);
    expect(agents!.content).toContain("truncated");
  });

  it("returns empty for no convention files", () => {
    const dir = makeDir("none");
    expect(detectConventions(dir)).toEqual([]);
  });
});
