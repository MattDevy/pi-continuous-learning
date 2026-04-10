import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { detectAvailableTopics, getOrGenerateTour, formatTourMarkdown } from "./tour-generator.js";
import type { StateRef } from "./types.js";
import { getOrGenerateCodemap } from "./codemap-generator.js";

export const COMMAND_NAME = "tour";

export async function handleTourCommand(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  stateRef: StateRef,
): Promise<void> {
  const state = stateRef.get();
  if (!state.project) {
    ctx.ui.notify("No project detected. Run from within a git repository.", "error");
    return;
  }

  const codemap = state.cachedCodemap?.data
    ?? getOrGenerateCodemap(state.project.root, state.project.id, state.project.name).codemap;

  const topic = args.trim();

  if (!topic) {
    const topics = detectAvailableTopics(state.project.root, codemap);
    if (topics.length === 0) {
      ctx.ui.notify("No tour topics detected in this project.", "info");
      return;
    }
    ctx.ui.notify(`Available tour topics:\n${topics.map((t) => `  - ${t}`).join("\n")}\n\nUsage: /tour <topic>`, "info");
    return;
  }

  const tour = getOrGenerateTour(
    state.project.root,
    topic,
    codemap,
    state.project.id,
  );

  const markdown = formatTourMarkdown(tour);
  pi.sendUserMessage(
    `${markdown}\n\nAsk me about any of these files for more detail.`,
    { deliverAs: "followUp" },
  );
}
