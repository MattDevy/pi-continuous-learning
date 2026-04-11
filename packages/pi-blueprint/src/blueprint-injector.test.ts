import { describe, it, expect } from "vitest";
import { buildInjectionBlock } from "./blueprint-injector.js";
import type { Blueprint, Phase, Task } from "./types.js";

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
    objective: "Add OAuth2",
    project_id: "proj-1",
    status: "active",
    created_at: "2026-04-11T00:00:00.000Z",
    updated_at: "2026-04-11T00:00:00.000Z",
    phases,
    active_phase_id: phases[0]?.id ?? null,
    active_task_id: null,
  };
}

describe("buildInjectionBlock", () => {
  it("returns null for no blueprint", () => {
    expect(buildInjectionBlock(null)).toBeNull();
  });

  it("returns null for completed blueprint", () => {
    const bp = { ...makeBlueprint([]), status: "completed" as const };
    expect(buildInjectionBlock(bp)).toBeNull();
  });

  it("returns null when no active phase", () => {
    const bp = { ...makeBlueprint([]), active_phase_id: null };
    expect(buildInjectionBlock(bp)).toBeNull();
  });

  it("includes objective and phase info", () => {
    const bp = makeBlueprint([
      makePhase({
        id: "1",
        status: "active",
        tasks: [makeTask({ id: "1.1", title: "Do thing", status: "in_progress" })],
      }),
    ]);
    const withTask = { ...bp, active_task_id: "1.1" };
    const block = buildInjectionBlock(withTask);
    expect(block).toContain("Add OAuth2");
    expect(block).toContain("Phase 1");
    expect(block).toContain("1.1 - Do thing");
  });

  it("includes blocked tasks", () => {
    const bp = makeBlueprint([
      makePhase({
        id: "1",
        status: "active",
        tasks: [
          makeTask({ id: "1.1" }),
          makeTask({ id: "1.2", title: "Blocked one", status: "blocked", dependencies: ["1.1"] }),
        ],
      }),
    ]);
    const block = buildInjectionBlock(bp);
    expect(block).toContain("Blocked Tasks");
    expect(block).toContain("Blocked one");
  });

  it("includes acceptance criteria for active task", () => {
    const bp = makeBlueprint([
      makePhase({
        id: "1",
        status: "active",
        tasks: [
          makeTask({
            id: "1.1",
            status: "in_progress",
            acceptance_criteria: ["Tests pass", "No regressions"],
          }),
        ],
      }),
    ]);
    const withTask = { ...bp, active_task_id: "1.1" };
    const block = buildInjectionBlock(withTask);
    expect(block).toContain("Tests pass");
    expect(block).toContain("No regressions");
  });
});
