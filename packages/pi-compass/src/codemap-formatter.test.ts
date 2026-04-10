import { describe, it, expect } from "vitest";
import { formatCodemapMarkdown, truncateCodemap } from "./codemap-formatter.js";
import type { CodeMap } from "./types.js";

const MINIMAL_MAP: CodeMap = {
  projectId: "abc",
  projectName: "test-project",
  generatedAt: "2026-01-01T00:00:00Z",
  contentHash: "abcdef1234567890",
  directoryTree: [
    { name: "src", type: "dir", children: [{ name: "index.ts", type: "file" }] },
    { name: "package.json", type: "file" },
  ],
  packages: [{ manager: "npm", name: "test-project", version: "1.0.0", dependencies: ["react", "typescript"] }],
  frameworks: [{ name: "React", confidence: "definite", source: "react" }],
  entryPoints: [{ path: "src/index.ts", kind: "index" }],
  buildScripts: [{ name: "build", command: "tsc", source: "package.json" }],
  conventions: [{ source: "AGENTS.md", content: "Use TDD." }],
  keyFiles: [{ path: "README.md", description: "Project documentation" }],
};

describe("formatCodemapMarkdown", () => {
  it("includes project name in header", () => {
    const md = formatCodemapMarkdown(MINIMAL_MAP);
    expect(md).toContain("## Codebase Map: test-project");
  });

  it("includes directory structure", () => {
    const md = formatCodemapMarkdown(MINIMAL_MAP);
    expect(md).toContain("### Directory Structure");
    expect(md).toContain("src/");
    expect(md).toContain("index.ts");
  });

  it("includes packages section", () => {
    const md = formatCodemapMarkdown(MINIMAL_MAP);
    expect(md).toContain("### Packages");
    expect(md).toContain("test-project");
    expect(md).toContain("npm");
  });

  it("includes frameworks section", () => {
    const md = formatCodemapMarkdown(MINIMAL_MAP);
    expect(md).toContain("### Frameworks");
    expect(md).toContain("React");
  });

  it("includes entry points", () => {
    const md = formatCodemapMarkdown(MINIMAL_MAP);
    expect(md).toContain("src/index.ts");
    expect(md).toContain("index");
  });

  it("includes build scripts", () => {
    const md = formatCodemapMarkdown(MINIMAL_MAP);
    expect(md).toContain("build");
    expect(md).toContain("tsc");
  });

  it("includes conventions", () => {
    const md = formatCodemapMarkdown(MINIMAL_MAP);
    expect(md).toContain("AGENTS.md");
    expect(md).toContain("Use TDD.");
  });

  it("includes key files", () => {
    const md = formatCodemapMarkdown(MINIMAL_MAP);
    expect(md).toContain("README.md");
  });

  it("handles empty codemap gracefully", () => {
    const empty: CodeMap = {
      ...MINIMAL_MAP,
      directoryTree: [],
      packages: [],
      frameworks: [],
      entryPoints: [],
      buildScripts: [],
      conventions: [],
      keyFiles: [],
    };
    const md = formatCodemapMarkdown(empty);
    expect(md).toContain("## Codebase Map: test-project");
    expect(md).not.toContain("### Directory Structure");
  });
});

describe("truncateCodemap", () => {
  it("returns full text when under limit", () => {
    const text = "short text";
    expect(truncateCodemap(text, 1000)).toBe(text);
  });

  it("truncates long text with message", () => {
    const text = "line1\nline2\nline3\nline4\nline5";
    const result = truncateCodemap(text, 15);
    expect(result).toContain("truncated");
    expect(result.length).toBeLessThan(text.length + 100);
  });
});
