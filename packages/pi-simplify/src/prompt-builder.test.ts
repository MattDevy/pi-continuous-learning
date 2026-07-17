import { describe, it, expect } from "vitest";
import { buildSimplifyPrompt } from "./prompt-builder.js";
import type { ChangedFile } from "./types.js";

describe("buildSimplifyPrompt", () => {
  const files: readonly ChangedFile[] = [
    { path: "src/foo.ts", status: "modified" },
    { path: "src/bar.ts", status: "added" },
  ];

  it("lists all file paths in the prompt", () => {
    const prompt = buildSimplifyPrompt(files);

    expect(prompt).toContain("src/foo.ts");
    expect(prompt).toContain("src/bar.ts");
  });

  it("includes preserve-functionality principle", () => {
    const prompt = buildSimplifyPrompt(files);

    expect(prompt).toMatch(/preserve.*functionality/i);
  });

  it("includes clarity principle", () => {
    const prompt = buildSimplifyPrompt(files);

    expect(prompt).toMatch(/clarity/i);
  });

  it("includes balance principle", () => {
    const prompt = buildSimplifyPrompt(files);

    expect(prompt).toMatch(/over-simplif/i);
  });

  it("includes project standards reference", () => {
    const prompt = buildSimplifyPrompt(files);

    expect(prompt).toMatch(/CLAUDE\.md|AGENTS\.md/);
  });

  it("includes instruction to run tests", () => {
    const prompt = buildSimplifyPrompt(files);

    expect(prompt).toMatch(/test/i);
  });

  it("works with a single file", () => {
    const prompt = buildSimplifyPrompt([{ path: "src/only.ts", status: "modified" }]);

    expect(prompt).toContain("src/only.ts");
  });

  it("includes scope restriction", () => {
    const prompt = buildSimplifyPrompt(files);

    expect(prompt).toMatch(/only.*review|do not.*outside/i);
  });

  it("restricts modified files to their changed line ranges", () => {
    const prompt = buildSimplifyPrompt([{
      path: "src/Foo.java",
      status: "modified",
      changedLines: [{ start: 100, end: 120 }, { start: 150, end: 150 }],
    }]);

    expect(prompt).toContain("changed lines: 100-120, 150");
    expect(prompt).toMatch(/must not\s+edit/i);
    expect(prompt).toMatch(/outside the listed\s+line ranges/i);
  });

  it("marks added files as entirely in scope", () => {
    const prompt = buildSimplifyPrompt([{
      path: "src/new.ts",
      status: "added",
    }]);

    expect(prompt).toContain("entire file is in scope");
  });

  it("marks deletion-only files as having no lines to simplify", () => {
    const prompt = buildSimplifyPrompt([{
      path: "src/foo.ts",
      status: "modified",
      changedLines: [],
    }]);

    expect(prompt).toContain("deletions only");
  });

  it("does not grant whole-file scope when changed lines are unavailable", () => {
    const prompt = buildSimplifyPrompt([{
      path: "src/foo.ts",
      status: "modified",
    }]);

    expect(prompt).toContain("changed lines unavailable");
    expect(prompt).toContain("inspect git diff before editing");
  });
});
