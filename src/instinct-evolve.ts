/**
 * /instinct-evolve command for pi-continuous-learning.
 * Analyzes instincts and suggests clustering, merging, and promotion
 * opportunities. Informational only - does not modify any instincts.
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { Instinct } from "./types.js";
import { loadProjectInstincts, loadGlobalInstincts } from "./instinct-store.js";
import { getBaseDir } from "./storage.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const COMMAND_NAME = "instinct-evolve";

/** Jaccard similarity threshold to suggest merging two instincts. */
export const MERGE_SIMILARITY_THRESHOLD = 0.3;

/** Minimum project-instinct confidence to suggest global promotion. */
export const PROMOTION_CONFIDENCE_THRESHOLD = 0.7;

/** Words excluded from trigger tokenization (noise words). */
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "is", "are", "was", "were", "be", "been", "i", "you",
  "we", "it", "this", "that", "when", "if", "by", "as", "use",
]);

/** Trigger keywords indicating a repeatable workflow. */
export const COMMAND_TRIGGER_KEYWORDS = [
  "always", "every time", "whenever", "each time",
  "before", "after", "run", "execute",
];

// ---------------------------------------------------------------------------
// Suggestion types
// ---------------------------------------------------------------------------

export interface MergeSuggestion {
  type: "merge";
  instincts: Instinct[];
  reason: string;
}

export interface CommandSuggestion {
  type: "command";
  instinct: Instinct;
  reason: string;
}

export interface PromotionSuggestion {
  type: "promotion";
  instinct: Instinct;
  reason: string;
}

export type EvolveSuggestion =
  | MergeSuggestion
  | CommandSuggestion
  | PromotionSuggestion;

// ---------------------------------------------------------------------------
// Trigger tokenization and similarity
// ---------------------------------------------------------------------------

/**
 * Tokenizes a trigger string into significant lowercase words.
 * Strips punctuation, filters stop words, requires length >= 3.
 */
export function tokenizeTrigger(trigger: string): Set<string> {
  const words = trigger
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return new Set(words);
}

/**
 * Computes Jaccard similarity between two instincts' trigger token sets.
 * Returns a value in [0, 1]; returns 0 when both sets are empty.
 */
export function triggerSimilarity(a: Instinct, b: Instinct): number {
  const tokensA = tokenizeTrigger(a.trigger);
  const tokensB = tokenizeTrigger(b.trigger);
  if (tokensA.size === 0 && tokensB.size === 0) return 0;

  const intersection = [...tokensA].filter((t) => tokensB.has(t));
  const union = new Set([...tokensA, ...tokensB]);
  return intersection.length / union.size;
}

// ---------------------------------------------------------------------------
// Clustering helpers
// ---------------------------------------------------------------------------

/**
 * Groups instinct pairs into connected components (clusters).
 * Uses BFS to find all instincts reachable from each starting node.
 */
function clusterPairs(
  pairs: [Instinct, Instinct][],
  allInGroup: Instinct[]
): Instinct[][] {
  const adj = new Map<string, Set<string>>();
  for (const [a, b] of pairs) {
    const aAdj = adj.get(a.id) ?? new Set<string>();
    aAdj.add(b.id);
    adj.set(a.id, aAdj);
    const bAdj = adj.get(b.id) ?? new Set<string>();
    bAdj.add(a.id);
    adj.set(b.id, bAdj);
  }

  const idMap = new Map<string, Instinct>(allInGroup.map((i) => [i.id, i]));
  const visited = new Set<string>();
  const clusters: Instinct[][] = [];

  for (const [startId] of adj) {
    if (visited.has(startId)) continue;

    const cluster: Instinct[] = [];
    const queue = [startId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const inst = idMap.get(id);
      if (inst) cluster.push(inst);
      for (const neighbor of adj.get(id) ?? []) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }

    if (cluster.length >= 2) clusters.push(cluster);
  }

  return clusters;
}

// ---------------------------------------------------------------------------
// Suggestion generators
// ---------------------------------------------------------------------------

/**
 * Finds pairs of instincts (within the same domain) whose triggers are
 * similar enough to suggest merging. Groups overlapping pairs into clusters.
 */
export function findMergeCandidates(instincts: Instinct[]): MergeSuggestion[] {
  const byDomain = new Map<string, Instinct[]>();
  for (const instinct of instincts) {
    const domain = instinct.domain || "uncategorized";
    byDomain.set(domain, [...(byDomain.get(domain) ?? []), instinct]);
  }

  const suggestions: MergeSuggestion[] = [];

  for (const [domain, group] of byDomain) {
    if (group.length < 2) continue;

    const pairs: [Instinct, Instinct][] = [];
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (!a || !b) continue;
        if (triggerSimilarity(a, b) >= MERGE_SIMILARITY_THRESHOLD) {
          pairs.push([a, b]);
        }
      }
    }

    if (pairs.length === 0) continue;

    const clusters = clusterPairs(pairs, group);
    for (const cluster of clusters) {
      suggestions.push({
        type: "merge",
        instincts: cluster,
        reason: `${cluster.length} instincts in domain "${domain}" have similar triggers and may be candidates for merging`,
      });
    }
  }

  return suggestions;
}

/**
 * Finds instincts whose trigger suggests they could become a slash command.
 */
export function findCommandCandidates(
  instincts: Instinct[]
): CommandSuggestion[] {
  return instincts
    .filter((instinct) => {
      const trigger = instinct.trigger.toLowerCase();
      return (
        instinct.domain === "workflow" ||
        COMMAND_TRIGGER_KEYWORDS.some((kw) => trigger.includes(kw))
      );
    })
    .map((instinct) => ({
      type: "command" as const,
      instinct,
      reason: `Trigger "${instinct.trigger}" suggests a repeatable workflow that could become a slash command`,
    }));
}

/**
 * Finds project-scoped instincts with confidence >= threshold not already global.
 */
export function findPromotionCandidates(
  instincts: Instinct[],
  globalInstinctIds: Set<string>
): PromotionSuggestion[] {
  return instincts
    .filter(
      (i) =>
        i.scope === "project" &&
        i.confidence >= PROMOTION_CONFIDENCE_THRESHOLD &&
        !globalInstinctIds.has(i.id)
    )
    .map((instinct) => ({
      type: "promotion" as const,
      instinct,
      reason: `Project instinct has confidence ${instinct.confidence.toFixed(2)} (>= ${PROMOTION_CONFIDENCE_THRESHOLD}) and may be ready for global promotion`,
    }));
}

/**
 * Generates all evolution suggestions from project and global instinct sets.
 */
export function generateEvolveSuggestions(
  projectInstincts: Instinct[],
  globalInstincts: Instinct[]
): EvolveSuggestion[] {
  const allInstincts = [...projectInstincts, ...globalInstincts];
  const globalIds = new Set(globalInstincts.map((i) => i.id));

  return [
    ...findMergeCandidates(allInstincts),
    ...findCommandCandidates(allInstincts),
    ...findPromotionCandidates(projectInstincts, globalIds),
  ];
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Formats evolution suggestions as a human-readable string.
 */
export function formatEvolveSuggestions(suggestions: EvolveSuggestion[]): string {
  if (suggestions.length === 0) {
    return "No evolution suggestions at this time. Keep using pi to accumulate more instincts!";
  }

  const lines: string[] = ["=== Instinct Evolution Suggestions ===", ""];

  const merges = suggestions.filter(
    (s): s is MergeSuggestion => s.type === "merge"
  );
  const commands = suggestions.filter(
    (s): s is CommandSuggestion => s.type === "command"
  );
  const promotions = suggestions.filter(
    (s): s is PromotionSuggestion => s.type === "promotion"
  );

  if (merges.length > 0) {
    lines.push("## Merge Candidates");
    lines.push("Related instincts with similar triggers that could be consolidated:");
    lines.push("");
    for (const s of merges) {
      lines.push(`  * ${s.reason}`);
      for (const i of s.instincts) {
        lines.push(`    - [${i.confidence.toFixed(2)}] ${i.id}: ${i.trigger}`);
      }
      lines.push("");
    }
  }

  if (commands.length > 0) {
    lines.push("## Potential Slash Commands");
    lines.push("Workflow instincts that could become reusable commands:");
    lines.push("");
    for (const s of commands) {
      lines.push(`  * [${s.instinct.confidence.toFixed(2)}] ${s.instinct.id}`);
      lines.push(`    Trigger: ${s.instinct.trigger}`);
      lines.push(`    Reason: ${s.reason}`);
      lines.push("");
    }
  }

  if (promotions.length > 0) {
    lines.push("## Promotion Candidates");
    lines.push("Project instincts ready for global promotion:");
    lines.push("");
    for (const s of promotions) {
      lines.push(`  * [${s.instinct.confidence.toFixed(2)}] ${s.instinct.id}: ${s.instinct.title}`);
      lines.push(`    ${s.reason}`);
      lines.push("");
    }
  }

  const total = suggestions.length;
  lines.push(
    `Total: ${total} suggestion${total !== 1 ? "s" : ""} (informational only - no changes applied)`
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// loadInstinctsForEvolve
// ---------------------------------------------------------------------------

/**
 * Loads project and global instincts for evolution analysis.
 * Includes all instincts regardless of confidence (to surface improvement opportunities).
 */
export function loadInstinctsForEvolve(
  projectId?: string | null,
  baseDir?: string
): { projectInstincts: Instinct[]; globalInstincts: Instinct[] } {
  const projectInstincts =
    projectId != null ? loadProjectInstincts(projectId, baseDir) : [];
  const globalInstincts = loadGlobalInstincts(baseDir);
  return { projectInstincts, globalInstincts };
}

// ---------------------------------------------------------------------------
// handleInstinctEvolve
// ---------------------------------------------------------------------------

/**
 * Command handler for /instinct-evolve.
 * Analyzes instincts and displays evolution suggestions.
 * Does NOT auto-apply any changes.
 */
export async function handleInstinctEvolve(
  _args: string,
  ctx: ExtensionCommandContext,
  projectId?: string | null,
  baseDir?: string
): Promise<void> {
  const effectiveBase = baseDir ?? getBaseDir();
  const { projectInstincts, globalInstincts } = loadInstinctsForEvolve(
    projectId,
    effectiveBase
  );
  const suggestions = generateEvolveSuggestions(projectInstincts, globalInstincts);
  const output = formatEvolveSuggestions(suggestions);
  ctx.ui.notify(output, "info");
}
