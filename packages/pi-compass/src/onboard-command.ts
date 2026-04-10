import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { generateCodemap } from "./codemap-generator.js";
import { formatCodemapMarkdown } from "./codemap-formatter.js";
import { saveCachedCodemap } from "./storage.js";
import type { StateRef, CacheEntry, CodeMap } from "./types.js";

export const COMMAND_NAME = "onboard";

export async function handleOnboardCommand(
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

  const forceRefresh = args.trim() === "--refresh";

  if (!forceRefresh && state.cachedCodemap && !state.stale) {
    const markdown = formatCodemapMarkdown(state.cachedCodemap.data);
    pi.sendUserMessage(
      `Here is the cached codebase map for ${state.project.name}:\n\n${markdown}`,
      { deliverAs: "followUp" },
    );
    return;
  }

  const codemap = generateCodemap(
    state.project.root,
    state.project.id,
    state.project.name,
  );

  const entry: CacheEntry<CodeMap> = {
    data: codemap,
    contentHash: codemap.contentHash,
    createdAt: codemap.generatedAt,
  };
  saveCachedCodemap(state.project.id, entry);

  stateRef.set({
    ...state,
    cachedCodemap: entry,
    stale: false,
    codemapInjected: false,
  });

  const markdown = formatCodemapMarkdown(codemap);
  pi.sendUserMessage(
    `Here is the codebase map for ${state.project.name}:\n\n${markdown}`,
    { deliverAs: "followUp" },
  );
}
