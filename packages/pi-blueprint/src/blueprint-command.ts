import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import type { StateRef } from "./types.js";
import { renderPlanMarkdown } from "./plan-renderer.js";
import { getBlueprintGeneratePrompt } from "./prompts/blueprint-generate.js";
import { abandonBlueprint } from "./state-machine.js";
import { saveBlueprint, appendHistory, saveIndex, loadIndex } from "./storage.js";

export const COMMAND_NAME = "blueprint";

export async function handleBlueprintCommand(
  args: string,
  ctx: ExtensionCommandContext,
  stateRef: StateRef,
  pi: ExtensionAPI,
): Promise<void> {
  const trimmed = args.trim();

  if (trimmed === "") {
    return showBriefStatus(ctx, stateRef);
  }

  if (trimmed.toLowerCase() === "abandon") {
    return handleAbandon(ctx, stateRef);
  }

  const state = stateRef.get();
  if (state.blueprint && state.blueprint.status === "active") {
    ctx.ui.notify(
      `An active blueprint already exists: "${state.blueprint.objective}"\nUse /blueprint abandon to discard it, or /plan-status for details.`,
      "warning",
    );
    return;
  }

  const prompt = getBlueprintGeneratePrompt(trimmed);
  pi.sendUserMessage(prompt, { deliverAs: "followUp" });
}

function showBriefStatus(ctx: ExtensionCommandContext, stateRef: StateRef): void {
  const state = stateRef.get();
  if (!state.blueprint) {
    ctx.ui.notify(
      "No active blueprint. Use /blueprint <objective> to create one.",
      "info",
    );
    return;
  }
  ctx.ui.notify(renderPlanMarkdown(state.blueprint), "info");
}

function handleAbandon(ctx: ExtensionCommandContext, stateRef: StateRef): void {
  const state = stateRef.get();
  if (!state.blueprint || state.blueprint.status !== "active") {
    ctx.ui.notify("No active blueprint to abandon.", "info");
    return;
  }

  const bp = abandonBlueprint(state.blueprint);
  saveBlueprint(bp);
  appendHistory(bp.id, {
    timestamp: new Date().toISOString(),
    event: "blueprint_abandoned",
    phase_id: null,
    task_id: null,
    session_id: state.sessionId,
    details: "User abandoned blueprint",
  });

  const index = loadIndex();
  if (index) {
    saveIndex({
      active_blueprint_id: null,
      blueprints: index.blueprints.map((e) =>
        e.id === bp.id ? { ...e, status: "abandoned" as const } : e,
      ),
    });
  }

  stateRef.set({ ...state, blueprint: null });
  ctx.ui.notify(`Blueprint "${bp.objective}" abandoned.`, "info");
}
