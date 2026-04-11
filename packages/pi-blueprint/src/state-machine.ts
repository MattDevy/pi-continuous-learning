import type { Blueprint, Phase, Task, TaskStatus, PhaseStatus } from "./types.js";
import { isTaskDone } from "./types.js";
import { findBlockedTasks, isTaskReady, getAllTasks } from "./dependency-graph.js";

function updateTask(phase: Phase, taskId: string, patch: Partial<Task>): Phase {
  return {
    ...phase,
    tasks: phase.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
  };
}

function updatePhase(blueprint: Blueprint, phaseId: string, patch: Partial<Phase>): Blueprint {
  return {
    ...blueprint,
    updated_at: new Date().toISOString(),
    phases: blueprint.phases.map((p) => (p.id === phaseId ? { ...p, ...patch } : p)),
  };
}

function findTask(
  blueprint: Blueprint,
  taskId: string,
): { phase: Phase; task: Task } | null {
  for (const phase of blueprint.phases) {
    const task = phase.tasks.find((t) => t.id === taskId);
    if (task) return { phase, task };
  }
  return null;
}

function findNextTaskInPhase(phase: Phase, allTasks: readonly Task[]): Task | null {
  for (const task of phase.tasks) {
    if (task.status === "in_progress") return task;
  }
  for (const task of phase.tasks) {
    if (task.status === "pending" && isTaskReady(allTasks, task.id)) return task;
  }
  return null;
}

function resolveTaskCompletion(
  blueprint: Blueprint,
  phaseId: string,
  taskId: string,
): Blueprint {
  let bp = recomputeBlocked(blueprint);

  if (bp.active_task_id === taskId) {
    const next = getNextTask(bp);
    bp = { ...bp, active_task_id: next?.id ?? null };
  }

  const currentPhase = bp.phases.find((p) => p.id === phaseId);
  if (currentPhase && currentPhase.tasks.every(isTaskDone)) {
    bp = updatePhase(bp, phaseId, { status: "completed" as PhaseStatus });
  }

  return bp;
}

export function startTask(
  blueprint: Blueprint,
  taskId: string,
  sessionId: string,
): Blueprint {
  const found = findTask(blueprint, taskId);
  if (!found) return blueprint;

  const { phase, task } = found;
  if (isTaskDone(task)) return blueprint;

  const now = new Date().toISOString();
  const updatedPhase = updateTask(phase, taskId, {
    status: "in_progress" as TaskStatus,
    started_at: task.started_at ?? now,
    session_id: sessionId,
  });

  let phaseStatus = phase.status;
  if (phaseStatus === "pending") {
    phaseStatus = "active";
  }

  let bp = updatePhase(blueprint, phase.id, {
    ...updatedPhase,
    status: phaseStatus,
    started_at: phase.started_at ?? now,
  });

  bp = {
    ...bp,
    active_phase_id: phase.id,
    active_task_id: taskId,
    status: blueprint.status === "draft" ? "active" : blueprint.status,
  };

  return bp;
}

export function completeTask(blueprint: Blueprint, taskId: string): Blueprint {
  const found = findTask(blueprint, taskId);
  if (!found) return blueprint;

  const { phase, task } = found;
  if (task.status === "completed") return blueprint;

  const updatedPhase = updateTask(phase, taskId, {
    status: "completed" as TaskStatus,
    completed_at: new Date().toISOString(),
  });

  let bp = updatePhase(blueprint, phase.id, updatedPhase);
  bp = resolveTaskCompletion(bp, phase.id, taskId);

  const allTasks = getAllTasks(bp.phases);
  if (allTasks.every(isTaskDone)) {
    const allVerified = bp.phases.every((p) =>
      p.verification_gates.length === 0 || p.verification_gates.every((g) => g.passed),
    );
    if (allVerified) {
      bp = { ...bp, status: "completed" };
    }
  }

  return bp;
}

export function skipTask(blueprint: Blueprint, taskId: string): Blueprint {
  const found = findTask(blueprint, taskId);
  if (!found) return blueprint;

  const { phase } = found;
  const updatedPhase = updateTask(phase, taskId, {
    status: "skipped" as TaskStatus,
    completed_at: new Date().toISOString(),
  });

  let bp = updatePhase(blueprint, phase.id, updatedPhase);
  bp = resolveTaskCompletion(bp, phase.id, taskId);

  return bp;
}

export function verifyGate(
  blueprint: Blueprint,
  phaseId: string,
  gateIndex: number,
  passed: boolean,
  errorMsg?: string,
): Blueprint {
  const phase = blueprint.phases.find((p) => p.id === phaseId);
  if (!phase) return blueprint;

  const gate = phase.verification_gates[gateIndex];
  if (!gate) return blueprint;

  const now = new Date().toISOString();
  const updatedGates = phase.verification_gates.map((g, i) =>
    i === gateIndex
      ? { ...g, passed, last_checked_at: now, error_message: errorMsg ?? null }
      : g,
  );

  return updatePhase(blueprint, phaseId, { verification_gates: updatedGates });
}

export function advancePhase(blueprint: Blueprint): Blueprint {
  const currentPhase = blueprint.phases.find((p) => p.id === blueprint.active_phase_id);
  if (!currentPhase) return blueprint;

  const allGatesPassed =
    currentPhase.verification_gates.length === 0 ||
    currentPhase.verification_gates.every((g) => g.passed);

  if (!currentPhase.tasks.every(isTaskDone) || !allGatesPassed) return blueprint;

  let bp = updatePhase(blueprint, currentPhase.id, {
    status: "verified" as PhaseStatus,
    completed_at: new Date().toISOString(),
  });

  const currentIdx = bp.phases.findIndex((p) => p.id === currentPhase.id);
  const nextPhase = bp.phases[currentIdx + 1];

  if (nextPhase) {
    bp = {
      ...bp,
      active_phase_id: nextPhase.id,
      active_task_id: null,
    };
    const next = getNextTask(bp);
    if (next) {
      bp = { ...bp, active_task_id: next.id };
    }
  } else {
    bp = {
      ...bp,
      active_phase_id: null,
      active_task_id: null,
      status: "completed",
    };
  }

  return bp;
}

export function getNextTask(blueprint: Blueprint): Task | null {
  const allTasks = getAllTasks(blueprint.phases);

  if (blueprint.active_phase_id) {
    const phase = blueprint.phases.find((p) => p.id === blueprint.active_phase_id);
    if (phase) {
      const found = findNextTaskInPhase(phase, allTasks);
      if (found) return found;
    }
  }

  for (const phase of blueprint.phases) {
    if (phase.status === "verified") continue;
    const found = findNextTaskInPhase(phase, allTasks);
    if (found) return found;
  }

  return null;
}

export function recomputeBlocked(blueprint: Blueprint): Blueprint {
  const allTasks = getAllTasks(blueprint.phases);
  const blockedIds = new Set(findBlockedTasks(allTasks));

  return {
    ...blueprint,
    updated_at: new Date().toISOString(),
    phases: blueprint.phases.map((phase) => ({
      ...phase,
      tasks: phase.tasks.map((task) => {
        if (isTaskDone(task)) return task;
        if (blockedIds.has(task.id) && task.status !== "blocked") {
          return { ...task, status: "blocked" as TaskStatus };
        }
        if (!blockedIds.has(task.id) && task.status === "blocked") {
          return { ...task, status: "pending" as TaskStatus };
        }
        return task;
      }),
    })),
  };
}

export function createBlueprint(
  id: string,
  objective: string,
  projectId: string,
  phases: readonly Phase[],
): Blueprint {
  const now = new Date().toISOString();
  let bp: Blueprint = {
    id,
    objective,
    project_id: projectId,
    status: "active",
    created_at: now,
    updated_at: now,
    phases,
    active_phase_id: phases[0]?.id ?? null,
    active_task_id: null,
  };
  bp = recomputeBlocked(bp);
  const next = getNextTask(bp);
  if (next) {
    bp = { ...bp, active_task_id: next.id };
  }
  return bp;
}

export function abandonBlueprint(blueprint: Blueprint): Blueprint {
  return { ...blueprint, status: "abandoned", updated_at: new Date().toISOString() };
}
