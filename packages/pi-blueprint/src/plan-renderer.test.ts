import { describe, it, expect } from "vitest";
import { renderPlanMarkdown } from "./plan-renderer.js";
import type { Blueprint, Phase, Task, VerificationGate } from "./types.js";

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
    created_at: "2026-04-11T00:00:00.000Z",
    updated_at: "2026-04-11T00:00:00.000Z",
    phases,
    active_phase_id: phases[0]?.id ?? null,
    active_task_id: null,
  };
}

describe("renderPlanMarkdown", () => {
  it("renders header with objective and status", () => {
    const bp = makeBlueprint([]);
    const md = renderPlanMarkdown(bp);
    expect(md).toContain("# Blueprint: Test objective");
    expect(md).toContain("**Status:** active");
  });

  it("renders phases with task counts", () => {
    const bp = makeBlueprint([
      makePhase({
        id: "1",
        tasks: [
          makeTask({ id: "1.1", status: "completed" }),
          makeTask({ id: "1.2" }),
        ],
      }),
    ]);
    const md = renderPlanMarkdown(bp);
    expect(md).toContain("## Phase 1: Phase 1 (active)");
    expect(md).toContain("1/2 tasks completed");
  });

  it("renders task checkboxes", () => {
    const bp = makeBlueprint([
      makePhase({
        id: "1",
        tasks: [
          makeTask({ id: "1.1", title: "Do thing", status: "completed" }),
          makeTask({ id: "1.2", title: "Next thing", status: "in_progress" }),
          makeTask({ id: "1.3", title: "Blocked thing", status: "blocked" }),
        ],
      }),
    ]);
    const md = renderPlanMarkdown(bp);
    expect(md).toContain("- [x] 1.1 Do thing");
    expect(md).toContain("- [ ] 1.2 Next thing *(in progress)*");
    expect(md).toContain("- [ ] 1.3 Blocked thing *(blocked)*");
  });

  it("renders verification gates", () => {
    const gate: VerificationGate = {
      type: "tests_pass",
      command: null,
      description: "All tests pass",
      passed: true,
      last_checked_at: null,
      error_message: null,
    };
    const bp = makeBlueprint([
      makePhase({ id: "1", verification_gates: [gate] }),
    ]);
    const md = renderPlanMarkdown(bp);
    expect(md).toContain("- [x] All tests pass");
  });

  it("marks active phase", () => {
    const bp = makeBlueprint([
      makePhase({ id: "1" }),
      makePhase({ id: "2" }),
    ]);
    const md = renderPlanMarkdown(bp);
    expect(md).toContain("Phase 1 (active)");
    expect(md).not.toContain("Phase 2 (active)");
  });
});
