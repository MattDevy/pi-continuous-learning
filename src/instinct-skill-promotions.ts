/**
 * Skill promotion candidate detection for /instinct-evolve.
 * Identifies instincts (individually or as merge-candidate clusters) that
 * have enough coherence and confidence to be formalized into a Pi skill file.
 */

import type { Instinct } from "./types.js";
import { SKILL_DOMAINS } from "./config.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum confidence for a single instinct to qualify as a skill promotion candidate. */
export const SKILL_PROMOTION_SINGLE_CONFIDENCE_THRESHOLD = 0.8;

/** Minimum confidence for each member of a cluster to qualify as a skill promotion candidate. */
export const SKILL_PROMOTION_CLUSTER_CONFIDENCE_THRESHOLD = 0.7;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillPromotionSuggestion {
  type: "skill-promotion";
  instincts: Instinct[];
  /** Human-readable reason including the suggested skill trigger/purpose. */
  reason: string;
  domain: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isDomainKnown(domain: string | undefined): domain is string {
  return (
    typeof domain === "string" &&
    domain.length > 0 &&
    Object.prototype.hasOwnProperty.call(SKILL_DOMAINS, domain)
  );
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Identifies instincts ready to be formalized as a Pi skill file.
 *
 * Single-instinct rule: confidence >= 0.8, domain in SKILL_DOMAINS, not in shadowIds.
 * Cluster rule: all members confidence >= 0.7, common domain in SKILL_DOMAINS,
 *               no member in shadowIds. Clusters are derived from merge candidates
 *               passed in as Instinct[][] (each sub-array is one cluster).
 *
 * Instincts that are part of a qualifying cluster are excluded from the single-instinct
 * check to avoid redundant suggestions.
 */
export function findSkillPromotionCandidates(
  instincts: Instinct[],
  mergeClusters: Instinct[][],
  shadowIds: Set<string>
): SkillPromotionSuggestion[] {
  const suggestions: SkillPromotionSuggestion[] = [];
  const clusterMemberIds = new Set<string>();

  // --- Cluster candidates ---
  for (const cluster of mergeClusters) {
    if (cluster.length < 2) continue;
    if (cluster.some((i) => shadowIds.has(i.id))) continue;
    if (
      !cluster.every(
        (i) => i.confidence >= SKILL_PROMOTION_CLUSTER_CONFIDENCE_THRESHOLD
      )
    )
      continue;

    // All members must share a single domain that is in SKILL_DOMAINS
    const domainSet = new Set(cluster.map((i) => i.domain ?? ""));
    if (domainSet.size !== 1) continue;
    const domain = [...domainSet][0]!;
    if (!isDomainKnown(domain)) continue;

    cluster.forEach((i) => clusterMemberIds.add(i.id));
    const purpose = SKILL_DOMAINS[domain]!;
    suggestions.push({
      type: "skill-promotion",
      instincts: cluster,
      reason: `Cluster of ${cluster.length} instincts in domain "${domain}" (${purpose}) is cohesive enough to formalize as a Pi skill`,
      domain,
    });
  }

  // --- Single-instinct candidates ---
  for (const instinct of instincts) {
    if (clusterMemberIds.has(instinct.id)) continue;
    if (shadowIds.has(instinct.id)) continue;
    if (instinct.confidence < SKILL_PROMOTION_SINGLE_CONFIDENCE_THRESHOLD) continue;
    if (!isDomainKnown(instinct.domain)) continue;

    const domain = instinct.domain!;
    const purpose = SKILL_DOMAINS[domain]!;
    suggestions.push({
      type: "skill-promotion",
      instincts: [instinct],
      reason: `High-confidence instinct in domain "${domain}" (${purpose}) is a candidate for a dedicated Pi skill`,
      domain,
    });
  }

  return suggestions;
}
