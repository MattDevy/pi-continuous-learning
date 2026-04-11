import type { Blueprint, Phase, Task } from "./types.js";
import { isTaskDone } from "./types.js";

export function renderPlanMarkdown(blueprint: Blueprint): string {
  const lines: string[] = [];
  lines.push(`# Blueprint: ${blueprint.objective}`);
  lines.push("");
  lines.push(`**Status:** ${blueprint.status} | Created: ${formatDate(blueprint.created_at)} | Updated: ${formatDate(blueprint.updated_at)}`);

  for (const phase of blueprint.phases) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(renderPhase(phase, blueprint.active_phase_id));
  }

  return lines.join("\n") + "\n";
}

function renderPhase(phase: Phase, activePhaseId: string | null): string {
  const lines: string[] = [];
  const isActive = phase.id === activePhaseId;
  const activeTag = isActive ? " (active)" : "";

  const completed = phase.tasks.filter(isTaskDone).length;
  const total = phase.tasks.length;

  lines.push(`## Phase ${phase.id}: ${phase.title}${activeTag}`);
  lines.push("");
  lines.push(`**Status:** ${phase.status} | ${completed}/${total} tasks completed`);

  if (phase.description) {
    lines.push("");
    lines.push(phase.description);
  }

  if (phase.tasks.length > 0) {
    lines.push("");
    lines.push("### Tasks");
    lines.push("");
    for (const task of phase.tasks) {
      lines.push(renderTask(task));
    }
  }

  if (phase.verification_gates.length > 0) {
    lines.push("");
    lines.push("### Verification Gates");
    lines.push("");
    for (const gate of phase.verification_gates) {
      const check = gate.passed ? "x" : " ";
      lines.push(`- [${check}] ${gate.description}`);
    }
  }

  return lines.join("\n");
}

function renderTask(task: Task): string {
  const check = isTaskDone(task) ? "x" : " ";
  let annotation = "";
  if (task.status === "in_progress") annotation = " *(in progress)*";
  else if (task.status === "blocked") annotation = " *(blocked)*";
  else if (task.status === "skipped") annotation = " *(skipped)*";
  return `- [${check}] ${task.id} ${task.title}${annotation}`;
}

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}
