import { describe, it, expect, vi } from "vitest";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { handlePlanStatusCommand } from "./plan-status-command.js";
import type { StateRef, BlueprintExtensionState, Phase, Task } from "./types.js";

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: overrides.id, description: "", status: "pending",
    acceptance_criteria: [], file_targets: [], dependencies: [],
    started_at: null, completed_at: null, session_id: null, notes: null,
    ...overrides,
  };
}

function makePhase(overrides: Partial<Phase> & { id: string }): Phase {
  return {
    title: `Phase ${overrides.id}`, description: "", status: "pending",
    tasks: [], verification_gates: [], started_at: null, completed_at: null,
    ...overrides,
  };
}

describe("handlePlanStatusCommand", () => {
  it("reports no blueprint", () => {
    const state: BlueprintExtensionState = { project: null, blueprint: null, sessionId: "" };
    const stateRef: StateRef = { get: () => state, set: () => {} };
    const ctx = { ui: { notify: vi.fn() } };
    handlePlanStatusCommand("", ctx as unknown as ExtensionCommandContext, stateRef);
    expect(ctx.ui.notify).toHaveBeenCalledWith("No active blueprint.", "info");
  });

  it("shows progress percentage", () => {
    const state: BlueprintExtensionState = {
      project: null, sessionId: "",
      blueprint: {
        id: "bp-1", objective: "Test", project_id: "p", status: "active",
        created_at: "2026-04-11T00:00:00.000Z", updated_at: "2026-04-11T00:00:00.000Z",
        phases: [makePhase({
          id: "1",
          tasks: [
            makeTask({ id: "1.1", status: "completed" }),
            makeTask({ id: "1.2" }),
          ],
        })],
        active_phase_id: "1", active_task_id: "1.2",
      },
    };
    const stateRef: StateRef = { get: () => state, set: () => {} };
    const ctx = { ui: { notify: vi.fn() } };
    handlePlanStatusCommand("", ctx as unknown as ExtensionCommandContext, stateRef);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("1/2 tasks (50%)"), "info");
  });
});
