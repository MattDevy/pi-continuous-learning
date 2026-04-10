import type { CodeMap, CompassState } from "./types.js";
import { formatCodemapMarkdown, truncateCodemap } from "./codemap-formatter.js";

export interface BeforeAgentStartEvent {
  type: "before_agent_start";
  prompt: string;
  systemPrompt: string;
}

export interface InjectionResult {
  systemPrompt: string;
}

export function buildCodemapInjection(
  codemap: CodeMap,
  stale: boolean,
  maxChars: number,
): string {
  const markdown = formatCodemapMarkdown(codemap);
  const truncated = truncateCodemap(markdown, maxChars);
  const staleNote = stale
    ? "\n\n> This codemap may be outdated. Run `/onboard` to refresh."
    : "";

  return `\n\n${truncated}${staleNote}`;
}

export function handleBeforeAgentStart(
  event: BeforeAgentStartEvent,
  state: CompassState,
  maxChars: number,
): InjectionResult | undefined {
  if (state.codemapInjected) return undefined;
  if (!state.cachedCodemap) return undefined;

  const block = buildCodemapInjection(
    state.cachedCodemap.data,
    state.stale,
    maxChars,
  );
  if (!block) return undefined;

  return { systemPrompt: event.systemPrompt + block };
}
