import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { handleBlueprintCommand } from "./blueprint-command.js";
import type { StateRef, BlueprintExtensionState, Blueprint, Phase, Task } from "./types.js";

vi.mock("./storage.js", () => ({
  saveBlueprint: vi.fn(),
  appendHistory: vi.fn(),
  saveIndex: vi.fn(),
  loadIndex: vi.fn().mockReturnValue(null),
}));

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

function makeBlueprint(): Blueprint {
  return {
    id: "bp-1", objective: "Test", project_id: "proj-1", status: "active",
    created_at: "2026-04-11T00:00:00.000Z", updated_at: "2026-04-11T00:00:00.000Z",
    phases: [makePhase({ id: "1", tasks: [makeTask({ id: "1.1" })] })],
    active_phase_id: "1", active_task_id: "1.1",
  };
}

function createMocks() {
  const notifications: { text: string; level: string }[] = [];
  const sentMessages: string[] = [];
  const ctx = {
    ui: {
      notify: vi.fn((text: string, level: string) => notifications.push({ text, level })),
    },
  };
  const pi = {
    sendUserMessage: vi.fn((text: string) => sentMessages.push(text)),
  };
  return { ctx, pi, notifications, sentMessages };
}

describe("handleBlueprintCommand", () => {
  let state: BlueprintExtensionState;
  let stateRef: StateRef;

  beforeEach(() => {
    state = { project: { id: "p", name: "test", root: "/tmp" }, blueprint: null, sessionId: "s" };
    stateRef = { get: () => state, set: (s) => { state = s; } };
  });

  it("shows status when no args and no blueprint", async () => {
    const { ctx, pi } = createMocks();
    await handleBlueprintCommand("", ctx as unknown as ExtensionCommandContext, stateRef, pi as unknown as ExtensionAPI);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("No active blueprint"), "info");
  });

  it("shows plan when no args and blueprint exists", async () => {
    state = { ...state, blueprint: makeBlueprint() };
    const { ctx, pi } = createMocks();
    await handleBlueprintCommand("", ctx as unknown as ExtensionCommandContext, stateRef, pi as unknown as ExtensionAPI);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Blueprint: Test"), "info");
  });

  it("sends generation prompt for new objective", async () => {
    const { ctx, pi } = createMocks();
    await handleBlueprintCommand("Add OAuth2 auth", ctx as unknown as ExtensionCommandContext, stateRef, pi as unknown as ExtensionAPI);
    expect(pi.sendUserMessage).toHaveBeenCalledWith(
      expect.stringContaining("Add OAuth2 auth"),
      expect.objectContaining({ deliverAs: "followUp" }),
    );
  });

  it("warns when active blueprint exists", async () => {
    state = { ...state, blueprint: makeBlueprint() };
    const { ctx, pi } = createMocks();
    await handleBlueprintCommand("New thing", ctx as unknown as ExtensionCommandContext, stateRef, pi as unknown as ExtensionAPI);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("already exists"), "warning");
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("abandons active blueprint", async () => {
    state = { ...state, blueprint: makeBlueprint() };
    const { ctx, pi } = createMocks();
    await handleBlueprintCommand("abandon", ctx as unknown as ExtensionCommandContext, stateRef, pi as unknown as ExtensionAPI);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("abandoned"), "info");
    expect(state.blueprint).toBeNull();
  });
});
