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

  it("preserves valuable comments while allowing redundant noise to be removed", () => {
    const prompt = buildSimplifyPrompt(files);

    expect(prompt).toMatch(/keep valuable comments/i);
    expect(prompt).toMatch(/design rationale/i);
    expect(prompt).toMatch(/business rules/i);
    expect(prompt).toMatch(/non-obvious behaviour/i);
    expect(prompt).toMatch(/intent/i);
    expect(prompt).toMatch(/remove only truly redundant noise/i);
    expect(prompt).not.toMatch(/remove unnecessary comments/i);
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
});
