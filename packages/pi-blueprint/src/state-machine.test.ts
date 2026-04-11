import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  startTask,
  completeTask,
  skipTask,
  verifyGate,
  advancePhase,
  getNextTask,
  recomputeBlocked,
  createBlueprint,
  abandonBlueprint,
} from "./state-machine.js";
import type { Blueprint, Phase, Task, VerificationGate } from "./types.js";

const NOW = "2026-04-11T00:00:00.000Z";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: overrides.id,
    description: "",
    status: "pending",
    acceptance_criteria: [],
    file_targets: [],
    dependencies: [],
    started_at: null,
    completed_at: null,
    session_id: null,
    notes: null,
    ...overrides,
  };
}

function makeGate(overrides?: Partial<VerificationGate>): VerificationGate {
  return {
    type: "tests_pass",
    command: null,
    description: "Tests pass",
    passed: false,
    last_checked_at: null,
    error_message: null,
    ...overrides,
  };
}

function makePhase(overrides: Partial<Phase> & { id: string }): Phase {
  return {
    title: `Phase ${overrides.id}`,
    description: "",
    status: "pending",
    tasks: [],
    verification_gates: [],
    started_at: null,
    completed_at: null,
    ...overrides,
  };
}

function makeBlueprint(phases: Phase[]): Blueprint {
  return {
    id: "bp-1",
    objective: "Test objective",
    project_id: "proj-1",
    status: "active",
    created_at: NOW,
    updated_at: NOW,
    phases,
    active_phase_id: phases[0]?.id ?? null,
    active_task_id: null,
  };
}

describe("startTask", () => {
  it("sets task to in_progress", () => {
    const bp = makeBlueprint([
      makePhase({ id: "1", tasks: [makeTask({ id: "1.1" })] }),
    ]);
    const result = startTask(bp, "1.1", "session-1");
    const task = result.phases[0]!.tasks[0]!;
    expect(task.status).toBe("in_progress");
    expect(task.session_id).toBe("session-1");
    expect(task.started_at).toBe(NOW);
  });

  it("activates phase if pending", () => {
    const bp = makeBlueprint([
      makePhase({ id: "1", tasks: [makeTask({ id: "1.1" })] }),
    ]);
    const result = startTask(bp, "1.1", "s");
    expect(result.phases[0]!.status).toBe("active");
    expect(result.active_phase_id).toBe("1");
    expect(result.active_task_id).toBe("1.1");
  });

  it("activates blueprint if draft", () => {
    const bp = { ...makeBlueprint([
      makePhase({ id: "1", tasks: [makeTask({ id: "1.1" })] }),
    ]), status: "draft" as const };
    const result = startTask(bp, "1.1", "s");
    expect(result.status).toBe("active");
  });

  it("does not change completed task", () => {
    const bp = makeBlueprint([
      makePhase({ id: "1", tasks: [makeTask({ id: "1.1", status: "completed" })] }),
    ]);
    const result = startTask(bp, "1.1", "s");
    expect(result.phases[0]!.tasks[0]!.status).toBe("completed");
  });

  it("returns blueprint unchanged for nonexistent task", () => {
    const bp = makeBlueprint([]);
    expect(startTask(bp, "nope", "s")).toBe(bp);
  });

  it("does not overwrite existing started_at", () => {
    const bp = makeBlueprint([
      makePhase({ id: "1", tasks: [makeTask({ id: "1.1", started_at: "earlier" })] }),
    ]);
    const result = startTask(bp, "1.1", "s");
    expect(result.phases[0]!.tasks[0]!.started_at).toBe("earlier");
  });
});

describe("completeTask", () => {
  it("sets task to completed with timestamp", () => {
    const bp = makeBlueprint([
      makePhase({ id: "1", tasks: [makeTask({ id: "1.1", status: "in_progress" })] }),
    ]);
    const result = completeTask(bp, "1.1");
    const task = result.phases[0]!.tasks[0]!;
    expect(task.status).toBe("completed");
    expect(task.completed_at).toBe(NOW);
  });

  it("unblocks downstream tasks", () => {
    const bp = makeBlueprint([
      makePhase({
        id: "1",
        status: "active",
        tasks: [
          makeTask({ id: "1.1", status: "in_progress" }),
          makeTask({ id: "1.2", status: "blocked", dependencies: ["1.1"] }),
        ],
      }),
    ]);
    const result = completeTask(bp, "1.1");
    expect(result.phases[0]!.tasks[1]!.status).toBe("pending");
  });

  it("advances active_task_id to next task", () => {
    const bp = {
      ...makeBlueprint([
        makePhase({
          id: "1",
          status: "active",
          tasks: [
            makeTask({ id: "1.1", status: "in_progress" }),
            makeTask({ id: "1.2" }),
          ],
        }),
      ]),
      active_task_id: "1.1",
    };
    const result = completeTask(bp, "1.1");
    expect(result.active_task_id).toBe("1.2");
  });

  it("marks phase completed when all tasks done", () => {
    const bp = makeBlueprint([
      makePhase({
        id: "1",
        status: "active",
        tasks: [makeTask({ id: "1.1", status: "in_progress" })],
      }),
    ]);
    const result = completeTask(bp, "1.1");
    expect(result.phases[0]!.status).toBe("completed");
  });

  it("does not change already completed task", () => {
    const bp = makeBlueprint([
      makePhase({ id: "1", tasks: [makeTask({ id: "1.1", status: "completed" })] }),
    ]);
    expect(completeTask(bp, "1.1")).toBe(bp);
  });
});

describe("skipTask", () => {
  it("sets task to skipped", () => {
    const bp = makeBlueprint([
      makePhase({ id: "1", tasks: [makeTask({ id: "1.1" })] }),
    ]);
    const result = skipTask(bp, "1.1");
    expect(result.phases[0]!.tasks[0]!.status).toBe("skipped");
  });

  it("unblocks downstream tasks", () => {
    const bp = makeBlueprint([
      makePhase({
        id: "1",
        status: "active",
        tasks: [
          makeTask({ id: "1.1" }),
          makeTask({ id: "1.2", status: "blocked", dependencies: ["1.1"] }),
        ],
      }),
    ]);
    const result = skipTask(bp, "1.1");
    expect(result.phases[0]!.tasks[1]!.status).toBe("pending");
  });
});

describe("verifyGate", () => {
  it("updates gate passed status", () => {
    const bp = makeBlueprint([
      makePhase({ id: "1", verification_gates: [makeGate()] }),
    ]);
    const result = verifyGate(bp, "1", 0, true);
    const gate = result.phases[0]!.verification_gates[0]!;
    expect(gate.passed).toBe(true);
    expect(gate.last_checked_at).toBe(NOW);
    expect(gate.error_message).toBeNull();
  });

  it("records error message on failure", () => {
    const bp = makeBlueprint([
      makePhase({ id: "1", verification_gates: [makeGate()] }),
    ]);
    const result = verifyGate(bp, "1", 0, false, "3 tests failed");
    const gate = result.phases[0]!.verification_gates[0]!;
    expect(gate.passed).toBe(false);
    expect(gate.error_message).toBe("3 tests failed");
  });

  it("returns unchanged for invalid phase", () => {
    const bp = makeBlueprint([]);
    expect(verifyGate(bp, "nope", 0, true)).toBe(bp);
  });

  it("returns unchanged for invalid gate index", () => {
    const bp = makeBlueprint([makePhase({ id: "1" })]);
    expect(verifyGate(bp, "1", 5, true)).toBe(bp);
  });
});

describe("advancePhase", () => {
  it("advances to next phase when all gates pass", () => {
    const bp = makeBlueprint([
      makePhase({
        id: "1",
        status: "completed",
        tasks: [makeTask({ id: "1.1", status: "completed" })],
        verification_gates: [makeGate({ passed: true })],
      }),
      makePhase({
        id: "2",
        tasks: [makeTask({ id: "2.1" })],
      }),
    ]);
    const withActive = { ...bp, active_phase_id: "1" };
    const result = advancePhase(withActive);
    expect(result.phases[0]!.status).toBe("verified");
    expect(result.active_phase_id).toBe("2");
    expect(result.active_task_id).toBe("2.1");
  });

  it("completes blueprint when last phase verified", () => {
    const bp = makeBlueprint([
      makePhase({
        id: "1",
        status: "completed",
        tasks: [makeTask({ id: "1.1", status: "completed" })],
      }),
    ]);
    const withActive = { ...bp, active_phase_id: "1" };
    const result = advancePhase(withActive);
    expect(result.status).toBe("completed");
    expect(result.active_phase_id).toBeNull();
  });

  it("does nothing if tasks incomplete", () => {
    const bp = makeBlueprint([
      makePhase({
        id: "1",
        status: "active",
        tasks: [makeTask({ id: "1.1", status: "in_progress" })],
      }),
    ]);
    const withActive = { ...bp, active_phase_id: "1" };
    const result = advancePhase(withActive);
    expect(result.active_phase_id).toBe("1");
  });

  it("does nothing if gates not passed", () => {
    const bp = makeBlueprint([
      makePhase({
        id: "1",
        status: "completed",
        tasks: [makeTask({ id: "1.1", status: "completed" })],
        verification_gates: [makeGate({ passed: false })],
      }),
      makePhase({ id: "2" }),
    ]);
    const withActive = { ...bp, active_phase_id: "1" };
    const result = advancePhase(withActive);
    expect(result.active_phase_id).toBe("1");
  });
});

describe("getNextTask", () => {
  it("returns in_progress task first", () => {
    const bp = {
      ...makeBlueprint([
        makePhase({
          id: "1",
          status: "active",
          tasks: [
            makeTask({ id: "1.1", status: "in_progress" }),
            makeTask({ id: "1.2" }),
          ],
        }),
      ]),
      active_phase_id: "1",
    };
    expect(getNextTask(bp)?.id).toBe("1.1");
  });

  it("returns first ready pending task", () => {
    const bp = {
      ...makeBlueprint([
        makePhase({
          id: "1",
          status: "active",
          tasks: [
            makeTask({ id: "1.1", status: "completed" }),
            makeTask({ id: "1.2" }),
          ],
        }),
      ]),
      active_phase_id: "1",
    };
    expect(getNextTask(bp)?.id).toBe("1.2");
  });

  it("skips blocked tasks", () => {
    const bp = {
      ...makeBlueprint([
        makePhase({
          id: "1",
          status: "active",
          tasks: [
            makeTask({ id: "1.1" }),
            makeTask({ id: "1.2", dependencies: ["1.1"] }),
          ],
        }),
      ]),
      active_phase_id: "1",
    };
    expect(getNextTask(bp)?.id).toBe("1.1");
  });

  it("returns null when all tasks done", () => {
    const bp = makeBlueprint([
      makePhase({
        id: "1",
        status: "completed",
        tasks: [makeTask({ id: "1.1", status: "completed" })],
      }),
    ]);
    expect(getNextTask(bp)).toBeNull();
  });
});

describe("recomputeBlocked", () => {
  it("marks tasks with incomplete deps as blocked", () => {
    const bp = makeBlueprint([
      makePhase({
        id: "1",
        tasks: [
          makeTask({ id: "1.1" }),
          makeTask({ id: "1.2", dependencies: ["1.1"] }),
        ],
      }),
    ]);
    const result = recomputeBlocked(bp);
    expect(result.phases[0]!.tasks[1]!.status).toBe("blocked");
  });

  it("unblocks when deps complete", () => {
    const bp = makeBlueprint([
      makePhase({
        id: "1",
        tasks: [
          makeTask({ id: "1.1", status: "completed" }),
          makeTask({ id: "1.2", status: "blocked", dependencies: ["1.1"] }),
        ],
      }),
    ]);
    const result = recomputeBlocked(bp);
    expect(result.phases[0]!.tasks[1]!.status).toBe("pending");
  });

  it("does not touch completed tasks", () => {
    const bp = makeBlueprint([
      makePhase({
        id: "1",
        tasks: [
          makeTask({ id: "1.1" }),
          makeTask({ id: "1.2", status: "completed", dependencies: ["1.1"] }),
        ],
      }),
    ]);
    const result = recomputeBlocked(bp);
    expect(result.phases[0]!.tasks[1]!.status).toBe("completed");
  });
});

describe("createBlueprint", () => {
  it("creates blueprint with initial blocked state computed", () => {
    const phases: Phase[] = [
      makePhase({
        id: "1",
        tasks: [
          makeTask({ id: "1.1" }),
          makeTask({ id: "1.2", dependencies: ["1.1"] }),
        ],
      }),
    ];
    const bp = createBlueprint("bp-1", "objective", "proj-1", phases);
    expect(bp.status).toBe("active");
    expect(bp.active_phase_id).toBe("1");
    expect(bp.active_task_id).toBe("1.1");
    expect(bp.phases[0]!.tasks[1]!.status).toBe("blocked");
  });
});

describe("abandonBlueprint", () => {
  it("sets status to abandoned", () => {
    const bp = makeBlueprint([]);
    const result = abandonBlueprint(bp);
    expect(result.status).toBe("abandoned");
  });
});
