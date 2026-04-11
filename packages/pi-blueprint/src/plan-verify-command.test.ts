import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { handlePlanVerifyCommand } from "./plan-verify-command.js";
import type { StateRef, BlueprintExtensionState, Phase, Task, VerificationGate } from "./types.js";

vi.mock("./storage.js", () => ({
  saveBlueprint: vi.fn(),
  appendHistory: vi.fn(),
}));

vi.mock("./verification.js", () => ({
  runGate: vi.fn().mockReturnValue({ passed: true, output: "ok", duration_ms: 100 }),
}));

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: overrides.id, description: "", status: "completed",
    acceptance_criteria: [], file_targets: [], dependencies: [],
    started_at: null, completed_at: null, session_id: null, notes: null,
    ...overrides,
  };
}

function makeGate(overrides?: Partial<VerificationGate>): VerificationGate {
  return {
    type: "tests_pass", command: null, description: "Tests pass",
    passed: false, last_checked_at: null, error_message: null,
    ...overrides,
  };
}

describe("handlePlanVerifyCommand", () => {
  let state: BlueprintExtensionState;
  let stateRef: StateRef;
  let ctx: { ui: { notify: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    ctx = { ui: { notify: vi.fn() } };
    state = {
      project: { id: "p", name: "test", root: "/tmp" },
      sessionId: "s",
      blueprint: {
        id: "bp-1", objective: "Test", project_id: "p", status: "active",
        created_at: "2026-04-11T00:00:00.000Z", updated_at: "2026-04-11T00:00:00.000Z",
        phases: [{
          id: "1", title: "P1", description: "", status: "completed",
          tasks: [makeTask({ id: "1.1" })],
          verification_gates: [makeGate()],
          started_at: null, completed_at: null,
        } satisfies Phase],
        active_phase_id: "1", active_task_id: null,
      },
    };
    stateRef = { get: () => state, set: (s) => { state = s; } };
  });

  it("reports no blueprint", () => {
    state = { ...state, blueprint: null };
    handlePlanVerifyCommand("", ctx as unknown as ExtensionCommandContext, stateRef);
    expect(ctx.ui.notify).toHaveBeenCalledWith("No active blueprint.", "info");
  });

  it("runs verification gates and reports results", () => {
    handlePlanVerifyCommand("", ctx as unknown as ExtensionCommandContext, stateRef);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("PASSED"),
      "info",
    );
  });
});
