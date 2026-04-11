import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { StateRef } from "./types.js";
import { isTaskDone } from "./types.js";
import { renderPlanMarkdown } from "./plan-renderer.js";
import { getAllTasks } from "./dependency-graph.js";

export const COMMAND_NAME = "plan-status";

export async function handlePlanStatusCommand(
  _args: string,
  ctx: ExtensionCommandContext,
  stateRef: StateRef,
): Promise<void> {
  const state = stateRef.get();
  if (!state.blueprint) {
    ctx.ui.notify("No active blueprint.", "info");
    return;
  }

  const bp = state.blueprint;
  const allTasks = getAllTasks(bp.phases);
  const completed = allTasks.filter(isTaskDone).length;
  const total = allTasks.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const header = `Progress: ${completed}/${total} tasks (${pct}%)`;
  const plan = renderPlanMarkdown(bp);

  ctx.ui.notify(`${header}\n\n${plan}`, "info");
}
