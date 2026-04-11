import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerBlueprintTools } from "./blueprint-tools.js";
import type { StateRef, BlueprintExtensionState, Blueprint, Phase, Task } from "./types.js";

vi.mock("./storage.js", () => ({
  saveBlueprint: vi.fn(),
  saveIndex: vi.fn(),
  appendHistory: vi.fn(),
  loadIndex: vi.fn().mockReturnValue(null),
}));

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
    objective: "Test",
    project_id: "proj-1",
    status: "active",
    created_at: "2026-04-11T00:00:00.000Z",
    updated_at: "2026-04-11T00:00:00.000Z",
    phases,
    active_phase_id: phases[0]?.id ?? null,
    active_task_id: phases[0]?.tasks[0]?.id ?? null,
  };
}

function createMockPi() {
  const tools = new Map<string, { execute: (...args: unknown[]) => Promise<unknown> }>();
  return {
    registerTool: vi.fn((tool: { name: string; execute: (...args: unknown[]) => Promise<unknown> }) => {
      tools.set(tool.name, tool);
    }),
    tools,
  };
}

describe("registerBlueprintTools", () => {
  let pi: ReturnType<typeof createMockPi>;
  let state: BlueprintExtensionState;
  let stateRef: StateRef;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-11T00:00:00.000Z"));
    pi = createMockPi();
    state = { project: { id: "proj-1", name: "test", root: "/tmp" }, blueprint: null, sessionId: "s-1" };
    stateRef = {
      get: () => state,
      set: (s) => { state = s; },
    };
    registerBlueprintTools(pi as unknown as import("@mariozechner/pi-coding-agent").ExtensionAPI, stateRef);
  });

  it("registers 4 tools", () => {
    expect(pi.registerTool).toHaveBeenCalledTimes(4);
    expect(pi.tools.has("blueprint_create")).toBe(true);
    expect(pi.tools.has("blueprint_status")).toBe(true);
    expect(pi.tools.has("blueprint_update")).toBe(true);
    expect(pi.tools.has("blueprint_next")).toBe(true);
  });

  describe("blueprint_create", () => {
    it("creates a blueprint from phases", async () => {
      const tool = pi.tools.get("blueprint_create")!;
      const result = await tool.execute("tc-1", {
        objective: "Add auth",
        phases: [{
          id: "1",
          title: "Foundation",
          description: "Set up basics",
          tasks: [{
            id: "1.1",
            title: "Create types",
            description: "Define types",
            acceptance_criteria: ["Types compile"],
            file_targets: ["src/types.ts"],
            dependencies: [],
          }],
          verification_gates: [{ type: "tests_pass", description: "Tests pass" }],
        }],
      }, undefined, undefined, undefined) as { content: { text: string }[]; details: Record<string, unknown> };
      expect(result.content[0]!.text).toContain("Blueprint created");
      expect(result.details["tasks"]).toBe(1);
      expect(state.blueprint).not.toBeNull();
    });

    it("rejects when active blueprint exists", async () => {
      state = {
        ...state,
        blueprint: makeBlueprint([makePhase({ id: "1" })]),
      };
      const tool = pi.tools.get("blueprint_create")!;
      const result = await tool.execute("tc-1", {
        objective: "New",
        phases: [],
      }, undefined, undefined, undefined) as { content: { text: string }[] };
      expect(result.content[0]!.text).toContain("active blueprint already exists");
    });

    it("rejects dependency cycles", async () => {
      const tool = pi.tools.get("blueprint_create")!;
      const result = await tool.execute("tc-1", {
        objective: "Cyclic",
        phases: [{
          id: "1",
          title: "P1",
          description: "",
          tasks: [
            { id: "1.1", title: "A", description: "", acceptance_criteria: [], file_targets: [], dependencies: ["1.2"] },
            { id: "1.2", title: "B", description: "", acceptance_criteria: [], file_targets: [], dependencies: ["1.1"] },
          ],
          verification_gates: [],
        }],
      }, undefined, undefined, undefined) as { content: { text: string }[] };
      expect(result.content[0]!.text).toContain("cycles");
    });
  });

  describe("blueprint_status", () => {
    it("returns no blueprint message when none active", async () => {
      const tool = pi.tools.get("blueprint_status")!;
      const result = await tool.execute("tc-1", {}, undefined, undefined, undefined) as { content: { text: string }[] };
      expect(result.content[0]!.text).toContain("No active blueprint");
    });

    it("returns plan markdown when blueprint exists", async () => {
      state = {
        ...state,
        blueprint: makeBlueprint([makePhase({ id: "1", tasks: [makeTask({ id: "1.1" })] })]),
      };
      const tool = pi.tools.get("blueprint_status")!;
      const result = await tool.execute("tc-1", {}, undefined, undefined, undefined) as { content: { text: string }[] };
      expect(result.content[0]!.text).toContain("Blueprint: Test");
    });
  });

  describe("blueprint_update", () => {
    it("marks task completed", async () => {
      state = {
        ...state,
        blueprint: makeBlueprint([
          makePhase({ id: "1", status: "active", tasks: [makeTask({ id: "1.1", status: "in_progress" })] }),
        ]),
      };
      const tool = pi.tools.get("blueprint_update")!;
      const result = await tool.execute("tc-1", {
        task_id: "1.1",
        status: "completed",
      }, undefined, undefined, undefined) as { content: { text: string }[] };
      expect(result.content[0]!.text).toContain("updated to completed");
      expect(state.blueprint!.phases[0]!.tasks[0]!.status).toBe("completed");
    });

    it("returns error for nonexistent task", async () => {
      state = {
        ...state,
        blueprint: makeBlueprint([makePhase({ id: "1" })]),
      };
      const tool = pi.tools.get("blueprint_update")!;
      const result = await tool.execute("tc-1", {
        task_id: "99.99",
        status: "completed",
      }, undefined, undefined, undefined) as { content: { text: string }[] };
      expect(result.content[0]!.text).toContain("not found");
    });
  });

  describe("blueprint_next", () => {
    it("returns next actionable task", async () => {
      state = {
        ...state,
        blueprint: makeBlueprint([
          makePhase({
            id: "1",
            status: "active",
            tasks: [
              makeTask({ id: "1.1", status: "completed" }),
              makeTask({ id: "1.2", title: "Next thing", acceptance_criteria: ["Works"] }),
            ],
          }),
        ]),
      };
      const tool = pi.tools.get("blueprint_next")!;
      const result = await tool.execute("tc-1", {}, undefined, undefined, undefined) as { content: { text: string }[] };
      expect(result.content[0]!.text).toContain("Next thing");
      expect(result.content[0]!.text).toContain("Works");
    });

    it("reports no tasks when all done", async () => {
      state = {
        ...state,
        blueprint: {
          ...makeBlueprint([
            makePhase({ id: "1", status: "verified", tasks: [makeTask({ id: "1.1", status: "completed" })] }),
          ]),
          status: "completed",
          active_phase_id: null,
          active_task_id: null,
        },
      };
      const tool = pi.tools.get("blueprint_next")!;
      const result = await tool.execute("tc-1", {}, undefined, undefined, undefined) as { content: { text: string }[] };
      expect(result.content[0]!.text).toContain("complete");
    });
  });
});
