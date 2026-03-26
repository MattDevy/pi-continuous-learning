import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildAnalyzerUserPrompt, tailObservations } from "./analyzer-user.js";
import type { ProjectEntry } from "../types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT: ProjectEntry = {
  id: "abc123def456",
  name: "my-project",
  root: "/home/user/my-project",
  remote: "https://github.com/user/my-project",
  created_at: "2026-01-01T00:00:00.000Z",
  last_seen: "2026-01-02T00:00:00.000Z",
};

const OBSERVATION_LINE = JSON.stringify({
  timestamp: "2026-01-01T00:00:00.000Z",
  event: "tool_start",
  session: "sess-001",
  project_id: "abc123def456",
  project_name: "my-project",
  tool: "Read",
  input: "some input",
});

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let tmpDir: string;
let obsPath: string;
let instinctsDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "us016-"));
  obsPath = join(tmpDir, "observations.jsonl");
  instinctsDir = join(tmpDir, "instincts", "personal");
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// tailObservations
// ---------------------------------------------------------------------------

describe("tailObservations", () => {
  it("returns empty array when file does not exist", () => {
    const result = tailObservations(join(tmpDir, "nonexistent.jsonl"));
    expect(result).toEqual([]);
  });

  it("returns all lines when count is below the limit", () => {
    const lines = [OBSERVATION_LINE, OBSERVATION_LINE, OBSERVATION_LINE];
    writeFileSync(obsPath, lines.join("\n") + "\n", "utf-8");
    const result = tailObservations(obsPath);
    expect(result).toHaveLength(3);
  });

  it("tails to the requested maxEntries when file has more lines", () => {
    const lines = Array.from({ length: 10 }, (_, i) =>
      JSON.stringify({ ...JSON.parse(OBSERVATION_LINE), session: `sess-${i}` })
    );
    writeFileSync(obsPath, lines.join("\n") + "\n", "utf-8");
    const result = tailObservations(obsPath, 3);
    expect(result).toHaveLength(3);
    // Should return the last 3 lines
    expect(result[2]).toContain("sess-9");
  });

  it("ignores blank lines in the file", () => {
    writeFileSync(obsPath, `${OBSERVATION_LINE}\n\n${OBSERVATION_LINE}\n`, "utf-8");
    const result = tailObservations(obsPath);
    expect(result).toHaveLength(2);
  });

  it("defaults to 500 max entries", () => {
    const lines = Array.from({ length: 600 }, (_, i) =>
      JSON.stringify({ ...JSON.parse(OBSERVATION_LINE), session: `s-${i}` })
    );
    writeFileSync(obsPath, lines.join("\n") + "\n", "utf-8");
    const result = tailObservations(obsPath);
    expect(result).toHaveLength(500);
  });
});

// ---------------------------------------------------------------------------
// buildAnalyzerUserPrompt
// ---------------------------------------------------------------------------

describe("buildAnalyzerUserPrompt", () => {
  beforeAll(() => {
    writeFileSync(obsPath, OBSERVATION_LINE + "\n", "utf-8");
  });

  it("includes the absolute path to observations.jsonl", () => {
    const prompt = buildAnalyzerUserPrompt(obsPath, instinctsDir, PROJECT);
    expect(prompt).toContain(obsPath);
  });

  it("includes the absolute path to the instincts directory", () => {
    const prompt = buildAnalyzerUserPrompt(obsPath, instinctsDir, PROJECT);
    expect(prompt).toContain(instinctsDir);
  });

  it("includes project_id in the prompt", () => {
    const prompt = buildAnalyzerUserPrompt(obsPath, instinctsDir, PROJECT);
    expect(prompt).toContain(PROJECT.id);
  });

  it("includes project_name in the prompt", () => {
    const prompt = buildAnalyzerUserPrompt(obsPath, instinctsDir, PROJECT);
    expect(prompt).toContain(PROJECT.name);
  });

  it("includes the tailed observation content", () => {
    const prompt = buildAnalyzerUserPrompt(obsPath, instinctsDir, PROJECT);
    expect(prompt).toContain("tool_start");
  });

  it("shows placeholder when observations file does not exist", () => {
    const noObs = join(tmpDir, "missing.jsonl");
    const prompt = buildAnalyzerUserPrompt(noObs, instinctsDir, PROJECT);
    expect(prompt).toContain("no observations recorded yet");
    // Path to the (missing) file is still in the prompt
    expect(prompt).toContain(noObs);
  });

  it("returns a non-empty string", () => {
    const prompt = buildAnalyzerUserPrompt(obsPath, instinctsDir, PROJECT);
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });

  it("mentions the max tail entries limit", () => {
    const prompt = buildAnalyzerUserPrompt(obsPath, instinctsDir, PROJECT);
    expect(prompt).toContain("500");
  });
});
