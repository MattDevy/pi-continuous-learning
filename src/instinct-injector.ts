/**
 * System prompt injection for pi-continuous-learning.
 * Loads filtered instincts and appends them to the system prompt on each
 * before_agent_start event so the agent benefits from learned behaviors.
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { BeforeAgentStartEvent } from "./prompt-observer.js";
import type { Config, Instinct } from "./types.js";

/** Subset of BeforeAgentStartEventResult used by this module. */
export interface InjectionResult {
  /** Replacement system prompt to use for this turn. */
  systemPrompt?: string;
}
import { loadAndFilterFromConfig } from "./instinct-loader.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const INSTINCTS_HEADER = "## Learned Behaviors (Instincts)";

// ---------------------------------------------------------------------------
// buildInjectionBlock
// ---------------------------------------------------------------------------

/**
 * Builds the injection block string from a list of instincts.
 * Returns null when the list is empty (no block needed).
 */
export function buildInjectionBlock(instincts: Instinct[]): string | null {
  if (instincts.length === 0) return null;

  const bullets = instincts
    .map((i) => {
      const confidence = i.confidence.toFixed(2);
      return `- [${confidence}] ${i.trigger}: ${i.action}`;
    })
    .join("\n");

  return `\n\n${INSTINCTS_HEADER}\n${bullets}`;
}

// ---------------------------------------------------------------------------
// injectInstincts (pure, for testing)
// ---------------------------------------------------------------------------

/**
 * Returns a modified system prompt string with injected instincts,
 * or null when no qualifying instincts were found.
 * Pure function - no I/O.
 */
export function injectInstincts(
  systemPrompt: string,
  instincts: Instinct[]
): string | null {
  const block = buildInjectionBlock(instincts);
  if (block === null) return null;
  return systemPrompt + block;
}

// ---------------------------------------------------------------------------
// handleBeforeAgentStartInjection
// ---------------------------------------------------------------------------

/**
 * Handles before_agent_start events.
 * Loads qualifying instincts and appends them to the system prompt.
 * Returns undefined when no instincts qualify (no-op).
 */
export function handleBeforeAgentStartInjection(
  event: BeforeAgentStartEvent,
  _ctx: ExtensionContext,
  config: Config,
  projectId?: string | null,
  baseDir?: string
): InjectionResult | void {
  const instincts = loadAndFilterFromConfig(config, projectId, baseDir);

  const modified = injectInstincts(event.systemPrompt, instincts);
  if (modified === null) {
    return undefined;
  }

  return { systemPrompt: modified };
}
