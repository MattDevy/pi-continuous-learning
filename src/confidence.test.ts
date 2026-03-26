import { describe, it, expect } from "vitest";
import {
  initialConfidence,
  adjustConfidence,
  applyPassiveDecay,
} from "./confidence.js";

// ---------------------------------------------------------------------------
// initialConfidence
// ---------------------------------------------------------------------------

describe("initialConfidence", () => {
  it("returns 0.3 for 1 observation", () => {
    expect(initialConfidence(1)).toBe(0.3);
  });

  it("returns 0.3 for 2 observations", () => {
    expect(initialConfidence(2)).toBe(0.3);
  });

  it("returns 0.5 for 3 observations", () => {
    expect(initialConfidence(3)).toBe(0.5);
  });

  it("returns 0.5 for 5 observations", () => {
    expect(initialConfidence(5)).toBe(0.5);
  });

  it("returns 0.7 for 6 observations", () => {
    expect(initialConfidence(6)).toBe(0.7);
  });

  it("returns 0.7 for 10 observations", () => {
    expect(initialConfidence(10)).toBe(0.7);
  });

  it("returns 0.85 for 11 observations", () => {
    expect(initialConfidence(11)).toBe(0.85);
  });

  it("returns 0.85 for 100 observations", () => {
    expect(initialConfidence(100)).toBe(0.85);
  });
});

// ---------------------------------------------------------------------------
// adjustConfidence
// ---------------------------------------------------------------------------

describe("adjustConfidence", () => {
  it("adds 0.05 for confirmed outcome", () => {
    const result = adjustConfidence(0.5, "confirmed");
    expect(result.confidence).toBeCloseTo(0.55);
    expect(result.flaggedForRemoval).toBe(false);
  });

  it("subtracts 0.15 for contradicted outcome", () => {
    const result = adjustConfidence(0.5, "contradicted");
    expect(result.confidence).toBeCloseTo(0.35);
    expect(result.flaggedForRemoval).toBe(false);
  });

  it("leaves confidence unchanged for inactive outcome", () => {
    const result = adjustConfidence(0.5, "inactive");
    expect(result.confidence).toBeCloseTo(0.5);
    expect(result.flaggedForRemoval).toBe(false);
  });

  it("clamps at 0.9 maximum", () => {
    const result = adjustConfidence(0.88, "confirmed");
    expect(result.confidence).toBe(0.9);
    expect(result.flaggedForRemoval).toBe(false);
  });

  it("clamps at 0.1 minimum and flags when raw value goes below 0.1", () => {
    // 0.2 - 0.15 = 0.05 < 0.1 → clamped to 0.1 and flagged
    const result = adjustConfidence(0.2, "contradicted");
    expect(result.confidence).toBe(0.1);
    expect(result.flaggedForRemoval).toBe(true);
  });

  it("flags for removal when raw value would go below 0.1", () => {
    const result = adjustConfidence(0.1, "contradicted");
    expect(result.confidence).toBe(0.1);
    expect(result.flaggedForRemoval).toBe(true);
  });

  it("does not flag for removal when exactly at 0.1 after clamping without going below", () => {
    const result = adjustConfidence(0.25, "contradicted");
    // 0.25 - 0.15 = 0.10, which is not below 0.1
    expect(result.confidence).toBeCloseTo(0.1);
    expect(result.flaggedForRemoval).toBe(false);
  });

  it("clamps at 0.9 for maximum boundary", () => {
    const result = adjustConfidence(0.9, "confirmed");
    expect(result.confidence).toBe(0.9);
    expect(result.flaggedForRemoval).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyPassiveDecay
// ---------------------------------------------------------------------------

describe("applyPassiveDecay", () => {
  it("applies no decay when last updated just now", () => {
    const now = new Date().toISOString();
    const result = applyPassiveDecay(0.7, now);
    expect(result.confidence).toBeCloseTo(0.7, 5);
    expect(result.flaggedForRemoval).toBe(false);
  });

  it("applies -0.02 for one week of decay", () => {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const result = applyPassiveDecay(0.5, oneWeekAgo);
    expect(result.confidence).toBeCloseTo(0.48, 5);
    expect(result.flaggedForRemoval).toBe(false);
  });

  it("applies -0.04 for two weeks of decay", () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const result = applyPassiveDecay(0.5, twoWeeksAgo);
    expect(result.confidence).toBeCloseTo(0.46, 5);
    expect(result.flaggedForRemoval).toBe(false);
  });

  it("clamps at 0.1 minimum after decay", () => {
    // need enough weeks so 0.5 - N*0.02 < 0.1 → N > 20 weeks → ~141 days
    const longAgo = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
    const result = applyPassiveDecay(0.5, longAgo);
    expect(result.confidence).toBe(0.1);
  });

  it("flags for removal when decay would push below 0.1", () => {
    const longAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    const result = applyPassiveDecay(0.1, longAgo);
    expect(result.confidence).toBe(0.1);
    expect(result.flaggedForRemoval).toBe(true);
  });

  it("does not apply negative decay (no gain from past dates in future)", () => {
    // If lastUpdated is in the future somehow, decay should be 0 (no time passed)
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const result = applyPassiveDecay(0.5, future);
    expect(result.confidence).toBeCloseTo(0.5, 5);
    expect(result.flaggedForRemoval).toBe(false);
  });
});
