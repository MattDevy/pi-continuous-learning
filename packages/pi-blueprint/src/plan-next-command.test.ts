import { describe, it, expect, vi } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { handlePlanNextCommand } from "./plan-next-command.js";
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

describe("handlePlanNextCommand", () => {
  it("reports no blueprint", () => {
    const state: BlueprintExtensionState = { project: null, blueprint: null, sessionId: "" };
    const stateRef: StateRef = { get: () => state, set: () => {} };
    const ctx = { ui: { notify: vi.fn() } };
    const pi = { sendUserMessage: vi.fn() };
    handlePlanNextCommand("", ctx as unknown as ExtensionCommandContext, stateRef, pi as unknown as ExtensionAPI);
    expect(ctx.ui.notify).toHaveBeenCalledWith("No active blueprint.", "info");
  });

  it("sends next task as follow-up message", () => {
    const state: BlueprintExtensionState = {
      project: null, sessionId: "",
      blueprint: {
        id: "bp-1", objective: "Test", project_id: "p", status: "active",
        created_at: "2026-04-11T00:00:00.000Z", updated_at: "2026-04-11T00:00:00.000Z",
        phases: [makePhase({
          id: "1", status: "active",
          tasks: [makeTask({ id: "1.1", title: "Do next thing" })],
        })],
        active_phase_id: "1", active_task_id: "1.1",
      },
    };
    const stateRef: StateRef = { get: () => state, set: () => {} };
    const ctx = { ui: { notify: vi.fn() } };
    const pi = { sendUserMessage: vi.fn() };
    handlePlanNextCommand("", ctx as unknown as ExtensionCommandContext, stateRef, pi as unknown as ExtensionAPI);
    expect(pi.sendUserMessage).toHaveBeenCalledWith(
      expect.stringContaining("Do next thing"),
      expect.objectContaining({ deliverAs: "followUp" }),
    );
  });

  it("reports completion when all done", () => {
    const state: BlueprintExtensionState = {
      project: null, sessionId: "",
      blueprint: {
        id: "bp-1", objective: "Test", project_id: "p", status: "completed",
        created_at: "2026-04-11T00:00:00.000Z", updated_at: "2026-04-11T00:00:00.000Z",
        phases: [makePhase({
          id: "1", status: "verified",
          tasks: [makeTask({ id: "1.1", status: "completed" })],
        })],
        active_phase_id: null, active_task_id: null,
      },
    };
    const stateRef: StateRef = { get: () => state, set: () => {} };
    const ctx = { ui: { notify: vi.fn() } };
    const pi = { sendUserMessage: vi.fn() };
    handlePlanNextCommand("", ctx as unknown as ExtensionCommandContext, stateRef, pi as unknown as ExtensionAPI);
    expect(ctx.ui.notify).toHaveBeenCalledWith("Blueprint is complete.", "info");
  });
});
