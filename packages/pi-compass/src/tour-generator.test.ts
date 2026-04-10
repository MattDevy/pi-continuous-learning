import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectAvailableTopics, generateTour, formatTourMarkdown } from "./tour-generator.js";
import type { CodeMap } from "./types.js";

const tmpBase = mkdtempSync(join(tmpdir(), "compass-tour-test-"));

afterAll(() => {
  rmSync(tmpBase, { recursive: true, force: true });
});

function makeCodemap(overrides: Partial<CodeMap> = {}): CodeMap {
  return {
    projectId: "abc",
    projectName: "test",
    generatedAt: "2026-01-01T00:00:00Z",
    contentHash: "hash",
    directoryTree: [
      { name: "src", type: "dir" },
      { name: "tests", type: "dir" },
      { name: ".github", type: "dir" },
    ],
    packages: [],
    frameworks: [],
    entryPoints: [],
    buildScripts: [],
    conventions: [],
    keyFiles: [{ path: ".github/workflows", description: "CI" }],
    ...overrides,
  };
}

describe("detectAvailableTopics", () => {
  it("includes top-level directories", () => {
    const topics = detectAvailableTopics(tmpBase, makeCodemap());
    expect(topics).toContain("src");
  });

  it("detects testing topic", () => {
    const topics = detectAvailableTopics(tmpBase, makeCodemap());
    expect(topics).toContain("testing");
  });

  it("detects ci topic", () => {
    const topics = detectAvailableTopics(tmpBase, makeCodemap());
    expect(topics).toContain("ci");
  });

  it("deduplicates topics", () => {
    const topics = detectAvailableTopics(tmpBase, makeCodemap());
    const unique = [...new Set(topics)];
    expect(topics.length).toBe(unique.length);
  });
});

describe("generateTour", () => {
  it("generates tour steps for a directory topic", () => {
    const dir = join(tmpBase, "tour-dir");
    mkdirSync(join(dir, "src", "auth"), { recursive: true });
    writeFileSync(join(dir, "src", "auth", "middleware.ts"), "export {}");
    writeFileSync(join(dir, "src", "auth", "handler.ts"), "export {}");

    const codemap = makeCodemap();
    const tour = generateTour(dir, "src", codemap);
    expect(tour.topic).toBe("src");
    expect(tour.steps.length).toBeGreaterThan(0);
  });

  it("generates tour for testing topic", () => {
    const dir = join(tmpBase, "tour-test");
    mkdirSync(join(dir, "tests"), { recursive: true });
    writeFileSync(join(dir, "tests", "auth.test.ts"), "");

    const tour = generateTour(dir, "testing", makeCodemap());
    expect(tour.steps.length).toBeGreaterThan(0);
  });
});

describe("formatTourMarkdown", () => {
  it("formats tour with numbered steps", () => {
    const tour = {
      projectId: "abc",
      topic: "auth",
      generatedAt: "2026-01-01T00:00:00Z",
      steps: [
        { file: "src/auth/middleware.ts", description: "Middleware: middleware" },
        { file: "src/auth/handler.ts", description: "Handler: handler" },
      ],
    };
    const md = formatTourMarkdown(tour);
    expect(md).toContain("## Code Tour: auth");
    expect(md).toContain("**1.**");
    expect(md).toContain("**2.**");
    expect(md).toContain("middleware.ts");
  });

  it("handles empty tour", () => {
    const tour = { projectId: "abc", topic: "empty", generatedAt: "", steps: [] };
    const md = formatTourMarkdown(tour);
    expect(md).toContain("No files found");
  });
});
