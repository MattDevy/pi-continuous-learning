import { describe, it, expect } from "vitest";
import {
  findSkillPromotionCandidates,
  SKILL_PROMOTION_SINGLE_CONFIDENCE_THRESHOLD,
  SKILL_PROMOTION_CLUSTER_CONFIDENCE_THRESHOLD,
} from "./instinct-skill-promotions.js";
import type { Instinct } from "./types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeInstinct(overrides: Partial<Instinct> & { id: string }): Instinct {
  return {
    id: overrides.id,
    title: overrides.title ?? "Test instinct",
    trigger: overrides.trigger ?? "when testing",
    action: overrides.action ?? "run tests",
    domain: overrides.domain ?? "testing",
    source: overrides.source ?? "personal",
    scope: overrides.scope ?? "project",
    confidence: overrides.confidence ?? 0.5,
    observation_count: overrides.observation_count ?? 1,
    confirmed_count: overrides.confirmed_count ?? 0,
    contradicted_count: overrides.contradicted_count ?? 0,
    inactive_count: overrides.inactive_count ?? 0,
    created_at: overrides.created_at ?? new Date().toISOString(),
    updated_at: overrides.updated_at ?? new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Single-instinct candidates
// ---------------------------------------------------------------------------

describe("findSkillPromotionCandidates - single instinct", () => {
  it("qualifies a single instinct with confidence >= 0.8 in a known domain", () => {
    const instinct = makeInstinct({
      id: "inst-1",
      domain: "git",
      confidence: 0.85,
    });
    const result = findSkillPromotionCandidates([instinct], [], new Set());
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("skill-promotion");
    expect(result[0]!.instincts).toEqual([instinct]);
    expect(result[0]!.domain).toBe("git");
    expect(result[0]!.reason).toContain("git");
  });

  it("does not qualify a single instinct with confidence < 0.8", () => {
    const instinct = makeInstinct({
      id: "inst-1",
      domain: "git",
      confidence: SKILL_PROMOTION_SINGLE_CONFIDENCE_THRESHOLD - 0.01,
    });
    const result = findSkillPromotionCandidates([instinct], [], new Set());
    expect(result).toHaveLength(0);
  });

  it("does not qualify a single instinct with confidence exactly at threshold", () => {
    // Boundary: exactly 0.8 DOES qualify (>= threshold)
    const instinct = makeInstinct({
      id: "inst-1",
      domain: "testing",
      confidence: SKILL_PROMOTION_SINGLE_CONFIDENCE_THRESHOLD,
    });
    const result = findSkillPromotionCandidates([instinct], [], new Set());
    expect(result).toHaveLength(1);
  });

  it("does not qualify a single instinct whose domain is not in SKILL_DOMAINS", () => {
    const instinct = makeInstinct({
      id: "inst-1",
      domain: "unknowndomain",
      confidence: 0.9,
    });
    const result = findSkillPromotionCandidates([instinct], [], new Set());
    expect(result).toHaveLength(0);
  });

  it("does not qualify a single instinct with empty-string domain", () => {
    const instinct = makeInstinct({ id: "inst-1", confidence: 0.9, domain: "" });
    const result = findSkillPromotionCandidates([instinct], [], new Set());
    expect(result).toHaveLength(0);
  });

  it("suppresses a single instinct whose id is in shadowIds", () => {
    const instinct = makeInstinct({
      id: "shadowed",
      domain: "debugging",
      confidence: 0.9,
    });
    const result = findSkillPromotionCandidates(
      [instinct],
      [],
      new Set(["shadowed"])
    );
    expect(result).toHaveLength(0);
  });

  it("includes reason with domain purpose text", () => {
    const instinct = makeInstinct({
      id: "inst-1",
      domain: "debugging",
      confidence: 0.9,
    });
    const result = findSkillPromotionCandidates([instinct], [], new Set());
    expect(result[0]!.reason).toContain("debugging");
    expect(result[0]!.reason).toContain("error analysis");
  });
});

// ---------------------------------------------------------------------------
// Cluster candidates
// ---------------------------------------------------------------------------

describe("findSkillPromotionCandidates - cluster candidates", () => {
  it("qualifies a cluster where all members meet threshold and share domain", () => {
    const a = makeInstinct({ id: "a", domain: "testing", confidence: 0.75 });
    const b = makeInstinct({ id: "b", domain: "testing", confidence: 0.80 });
    const result = findSkillPromotionCandidates([], [[a, b]], new Set());
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("skill-promotion");
    expect(result[0]!.instincts).toEqual([a, b]);
    expect(result[0]!.domain).toBe("testing");
    expect(result[0]!.reason).toContain("Cluster of 2");
  });

  it("uses cluster threshold 0.7 (lower than single 0.8)", () => {
    const a = makeInstinct({
      id: "a",
      domain: "git",
      confidence: SKILL_PROMOTION_CLUSTER_CONFIDENCE_THRESHOLD,
    });
    const b = makeInstinct({
      id: "b",
      domain: "git",
      confidence: SKILL_PROMOTION_CLUSTER_CONFIDENCE_THRESHOLD,
    });
    const result = findSkillPromotionCandidates([], [[a, b]], new Set());
    expect(result).toHaveLength(1);
  });

  it("rejects a cluster if any member confidence < 0.7", () => {
    const a = makeInstinct({ id: "a", domain: "git", confidence: 0.80 });
    const b = makeInstinct({
      id: "b",
      domain: "git",
      confidence: SKILL_PROMOTION_CLUSTER_CONFIDENCE_THRESHOLD - 0.01,
    });
    const result = findSkillPromotionCandidates([], [[a, b]], new Set());
    expect(result).toHaveLength(0);
  });

  it("rejects a cluster if members do not share a single domain", () => {
    const a = makeInstinct({ id: "a", domain: "git", confidence: 0.80 });
    const b = makeInstinct({ id: "b", domain: "testing", confidence: 0.80 });
    const result = findSkillPromotionCandidates([], [[a, b]], new Set());
    expect(result).toHaveLength(0);
  });

  it("rejects a cluster if the shared domain is not in SKILL_DOMAINS", () => {
    const a = makeInstinct({ id: "a", domain: "unknowndomain", confidence: 0.80 });
    const b = makeInstinct({ id: "b", domain: "unknowndomain", confidence: 0.80 });
    const result = findSkillPromotionCandidates([], [[a, b]], new Set());
    expect(result).toHaveLength(0);
  });

  it("suppresses a cluster if any member id is in shadowIds", () => {
    const a = makeInstinct({ id: "shadowed", domain: "git", confidence: 0.80 });
    const b = makeInstinct({ id: "b", domain: "git", confidence: 0.80 });
    const result = findSkillPromotionCandidates(
      [],
      [[a, b]],
      new Set(["shadowed"])
    );
    expect(result).toHaveLength(0);
  });

  it("rejects clusters of size 1", () => {
    const a = makeInstinct({ id: "a", domain: "git", confidence: 0.90 });
    const result = findSkillPromotionCandidates([], [[a]], new Set());
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Deduplication: cluster members excluded from single-instinct pass
// ---------------------------------------------------------------------------

describe("findSkillPromotionCandidates - deduplication", () => {
  it("does not suggest cluster members as individual candidates", () => {
    // Both instincts qualify individually (confidence >= 0.8) AND as a cluster
    const a = makeInstinct({ id: "a", domain: "git", confidence: 0.90 });
    const b = makeInstinct({ id: "b", domain: "git", confidence: 0.85 });
    const result = findSkillPromotionCandidates([a, b], [[a, b]], new Set());
    // Should appear once as a cluster, not twice as individuals + once as cluster
    expect(result).toHaveLength(1);
    expect(result[0]!.instincts).toHaveLength(2);
  });

  it("still suggests non-cluster instincts as individuals when clusters exist", () => {
    const a = makeInstinct({ id: "a", domain: "git", confidence: 0.90 });
    const b = makeInstinct({ id: "b", domain: "git", confidence: 0.85 });
    const c = makeInstinct({ id: "c", domain: "testing", confidence: 0.82 });
    const result = findSkillPromotionCandidates([a, b, c], [[a, b]], new Set());
    expect(result).toHaveLength(2); // 1 cluster + 1 individual
    const types = result.map((r) => (r.instincts.length === 1 ? "single" : "cluster"));
    expect(types).toContain("single");
    expect(types).toContain("cluster");
  });
});

// ---------------------------------------------------------------------------
// Empty results
// ---------------------------------------------------------------------------

describe("findSkillPromotionCandidates - empty results", () => {
  it("returns empty array when no instincts provided", () => {
    const result = findSkillPromotionCandidates([], [], new Set());
    expect(result).toHaveLength(0);
  });

  it("returns empty array when all instincts are shadowed", () => {
    const a = makeInstinct({ id: "a", domain: "git", confidence: 0.95 });
    const b = makeInstinct({ id: "b", domain: "git", confidence: 0.90 });
    const result = findSkillPromotionCandidates(
      [a, b],
      [[a, b]],
      new Set(["a", "b"])
    );
    expect(result).toHaveLength(0);
  });

  it("returns empty array when confidence is too low for all", () => {
    const a = makeInstinct({ id: "a", domain: "git", confidence: 0.50 });
    const result = findSkillPromotionCandidates([a], [], new Set());
    expect(result).toHaveLength(0);
  });
});
