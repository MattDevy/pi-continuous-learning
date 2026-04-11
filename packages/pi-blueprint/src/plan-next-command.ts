import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import type { StateRef } from "./types.js";
import { getNextTask } from "./state-machine.js";

export const COMMAND_NAME = "plan-next";

export async function handlePlanNextCommand(
  _args: string,
  ctx: ExtensionCommandContext,
  stateRef: StateRef,
  pi: ExtensionAPI,
): Promise<void> {
  const state = stateRef.get();
  if (!state.blueprint) {
    ctx.ui.notify("No active blueprint.", "info");
    return;
  }

  const next = getNextTask(state.blueprint);
  if (!next) {
    ctx.ui.notify(
      state.blueprint.status === "completed"
        ? "Blueprint is complete."
        : "No actionable tasks. Some may be blocked or awaiting verification.",
      "info",
    );
    return;
  }

  const lines = [
    `Work on blueprint task ${next.id}: ${next.title}`,
    "",
    next.description,
  ];

  if (next.acceptance_criteria.length > 0) {
    lines.push("", "Acceptance criteria:");
    for (const c of next.acceptance_criteria) {
      lines.push(`- ${c}`);
    }
  }

  if (next.file_targets.length > 0) {
    lines.push("", "File targets:");
    for (const f of next.file_targets) {
      lines.push(`- ${f}`);
    }
  }

  lines.push("", "When done, call the blueprint_update tool to mark this task as completed.");

  pi.sendUserMessage(lines.join("\n"), { deliverAs: "followUp" });
}
