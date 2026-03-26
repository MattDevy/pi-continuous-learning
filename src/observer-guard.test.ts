import { describe, it, expect, beforeEach } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  isAnalyzerRunning,
  setAnalyzerRunning,
  shouldSkipPath,
  shouldSkipObservation,
} from "./observer-guard.js";

const LEARNING_BASE = join(homedir(), ".pi", "continuous-learning");

describe("observer-guard", () => {
  beforeEach(() => {
    setAnalyzerRunning(false);
  });

  describe("isAnalyzerRunning / setAnalyzerRunning", () => {
    it("defaults to false", () => {
      expect(isAnalyzerRunning()).toBe(false);
    });

    it("returns true after setAnalyzerRunning(true)", () => {
      setAnalyzerRunning(true);
      expect(isAnalyzerRunning()).toBe(true);
    });

    it("returns false after setAnalyzerRunning(false)", () => {
      setAnalyzerRunning(true);
      setAnalyzerRunning(false);
      expect(isAnalyzerRunning()).toBe(false);
    });
  });

  describe("shouldSkipPath", () => {
    it("returns true for paths under ~/.pi/continuous-learning/", () => {
      const path = join(LEARNING_BASE, "projects", "abc123", "observations.jsonl");
      expect(shouldSkipPath(path)).toBe(true);
    });

    it("returns true for the base directory itself", () => {
      expect(shouldSkipPath(LEARNING_BASE)).toBe(true);
    });

    it("returns false for unrelated paths", () => {
      expect(shouldSkipPath("/home/user/projects/my-app/src/index.ts")).toBe(false);
    });

    it("returns false for paths that start with a similar prefix but differ", () => {
      const unrelated = join(homedir(), ".pi", "continuous-learning-other", "file.txt");
      expect(shouldSkipPath(unrelated)).toBe(false);
    });
  });

  describe("shouldSkipObservation", () => {
    it("returns false when flag is off and no path given", () => {
      expect(shouldSkipObservation()).toBe(false);
    });

    it("returns true when analyzer is running (no path)", () => {
      setAnalyzerRunning(true);
      expect(shouldSkipObservation()).toBe(true);
    });

    it("returns true when analyzer is running and normal path given", () => {
      setAnalyzerRunning(true);
      expect(shouldSkipObservation("/home/user/projects/app/main.ts")).toBe(true);
    });

    it("returns true for filtered path even when analyzer is not running", () => {
      const path = join(LEARNING_BASE, "instincts", "personal", "instinct-1.md");
      expect(shouldSkipObservation(path)).toBe(true);
    });

    it("returns false for normal path when analyzer is not running", () => {
      expect(shouldSkipObservation("/home/user/projects/app/main.ts")).toBe(false);
    });
  });
});
