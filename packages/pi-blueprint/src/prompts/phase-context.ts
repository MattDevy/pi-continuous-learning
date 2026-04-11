import type { Blueprint, Task } from "../types.js";
import { isTaskDone } from "../types.js";
import { getBlockingTasks, getAllTasks } from "../dependency-graph.js";

export function buildPhaseContext(blueprint: Blueprint): string {
  const lines: string[] = [];

  lines.push(`## Active Blueprint: "${blueprint.objective}"`);
  lines.push("");

  const activePhase = blueprint.phases.find((p) => p.id === blueprint.active_phase_id);
  if (!activePhase) {
    lines.push("No active phase. All phases may be complete or verified.");
    return lines.join("\n");
  }

  const completed = activePhase.tasks.filter(isTaskDone).length;

  lines.push(`### Current Phase: Phase ${activePhase.id} - ${activePhase.title}`);
  lines.push(`Status: ${activePhase.status} | ${completed}/${activePhase.tasks.length} tasks completed`);

  const activeTask = activePhase.tasks.find((t) => t.id === blueprint.active_task_id);
  if (activeTask) {
    lines.push("");
    lines.push(buildTaskContext(activeTask));
  }

  const blockedTasks = activePhase.tasks.filter((t) => t.status === "blocked");
  if (blockedTasks.length > 0) {
    lines.push("");
    lines.push("### Blocked Tasks");
    const allTasks = getAllTasks(blueprint.phases);
    for (const task of blockedTasks) {
      const blockers = getBlockingTasks(allTasks, task.id);
      lines.push(`- ${task.id} "${task.title}" - blocked by ${blockers.join(", ")}`);
    }
  }

  if (activePhase.verification_gates.length > 0) {
    lines.push("");
    lines.push(`### Phase ${activePhase.id} Verification Gates`);
    for (const gate of activePhase.verification_gates) {
      const check = gate.passed ? "x" : " ";
      lines.push(`- [${check}] ${gate.description}`);
    }
  }

  return lines.join("\n");
}

function buildTaskContext(task: Task): string {
  const lines: string[] = [];
  lines.push(`### Current Task: ${task.id} - ${task.title}`);

  if (task.description) {
    lines.push(task.description);
  }

  if (task.acceptance_criteria.length > 0) {
    lines.push("");
    lines.push("**Acceptance criteria:**");
    for (const c of task.acceptance_criteria) {
      lines.push(`- ${c}`);
    }
  }

  if (task.file_targets.length > 0) {
    lines.push("");
    lines.push("**File targets:**");
    for (const f of task.file_targets) {
      lines.push(`- ${f}`);
    }
  }

  return lines.join("\n");
}
