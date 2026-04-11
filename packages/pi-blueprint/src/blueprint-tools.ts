import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { StateRef, Phase, Task, VerificationGate } from "./types.js";
import {
  createBlueprint,
  startTask,
  completeTask,
  skipTask,
  getNextTask,
} from "./state-machine.js";
import { detectCycles, getAllTasks } from "./dependency-graph.js";
import { saveBlueprint, saveIndex, appendHistory, loadIndex } from "./storage.js";
import { renderPlanMarkdown } from "./plan-renderer.js";

const PhaseSchema = Type.Object({
  id: Type.String({ description: "Phase ID, e.g. '1', '2'" }),
  title: Type.String({ description: "Phase title" }),
  description: Type.String({ description: "Phase description" }),
  tasks: Type.Array(
    Type.Object({
      id: Type.String({ description: "Task ID, e.g. '1.1', '2.3'" }),
      title: Type.String({ description: "Imperative task title" }),
      description: Type.String({ description: "What to implement" }),
      acceptance_criteria: Type.Array(Type.String(), { description: "Testable acceptance criteria" }),
      file_targets: Type.Array(Type.String(), { description: "Files to create or modify" }),
      dependencies: Type.Array(Type.String(), { description: "Task IDs this depends on" }),
    }),
  ),
  verification_gates: Type.Array(
    Type.Object({
      type: Type.Union([
        Type.Literal("tests_pass"),
        Type.Literal("typecheck_clean"),
        Type.Literal("user_approval"),
        Type.Literal("custom_command"),
      ]),
      description: Type.String(),
      command: Type.Optional(Type.String({ description: "Shell command for custom_command type" })),
    }),
  ),
});

const CreateParams = Type.Object({
  objective: Type.String({ description: "High-level objective for the blueprint" }),
  phases: Type.Array(PhaseSchema, { description: "Ordered phases of work" }),
});

const StatusParams = Type.Object({});

const UpdateParams = Type.Object({
  task_id: Type.String({ description: "Task ID to update (e.g. '1.1')" }),
  status: Type.Union([
    Type.Literal("in_progress"),
    Type.Literal("completed"),
    Type.Literal("skipped"),
  ], { description: "New status" }),
  notes: Type.Optional(Type.String({ description: "Optional notes about the change" })),
});

const NextParams = Type.Object({});

function generateId(): string {
  return `bp-${Date.now().toString(36)}`;
}

export function registerBlueprintTools(pi: ExtensionAPI, stateRef: StateRef): void {
  const guidelines = [
    "Use blueprint_create to generate a new multi-session plan from an objective.",
    "Use blueprint_status to check current plan progress.",
    "Use blueprint_update to mark tasks as completed, in_progress, or skipped.",
    "Use blueprint_next to get the next actionable task.",
  ];

  pi.registerTool({
    name: "blueprint_create" as const,
    label: "Create Blueprint",
    description: "Create a new phased construction plan from an objective and structured phases",
    promptSnippet: "Create a multi-session blueprint plan",
    parameters: CreateParams,
    promptGuidelines: guidelines,
    async execute(
      _toolCallId: string,
      params: { objective: string; phases: readonly RawPhase[] },
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      _ctx: unknown,
    ) {
      const state = stateRef.get();
      if (state.blueprint && state.blueprint.status === "active") {
        return {
          content: [{
            type: "text" as const,
            text: `Error: An active blueprint already exists ("${state.blueprint.objective}"). Complete or abandon it first.`,
          }],
          details: { error: "active_blueprint_exists" } as Record<string, unknown>,
        };
      }

      const phases = buildPhases(params.phases);
      const allTasks = getAllTasks(phases);
      const cycles = detectCycles(allTasks);
      if (cycles.length > 0) {
        return {
          content: [{
            type: "text" as const,
            text: `Error: Dependency cycles detected: ${JSON.stringify(cycles)}`,
          }],
          details: { error: "dependency_cycles", cycles } as Record<string, unknown>,
        };
      }

      const projectId = state.project?.id ?? "unknown";
      const id = generateId();
      const blueprint = createBlueprint(id, params.objective, projectId, phases);

      saveBlueprint(blueprint);
      const index = loadIndex() ?? { active_blueprint_id: null, blueprints: [] };
      saveIndex({
        active_blueprint_id: id,
        blueprints: [
          ...index.blueprints,
          {
            id,
            objective: params.objective,
            status: "active",
            created_at: blueprint.created_at,
            project_id: projectId,
          },
        ],
      });
      appendHistory(id, {
        timestamp: new Date().toISOString(),
        event: "blueprint_created",
        phase_id: null,
        task_id: null,
        session_id: state.sessionId,
        details: params.objective,
      });

      stateRef.set({ ...state, blueprint });

      const summary = renderPlanMarkdown(blueprint);
      return {
        content: [{ type: "text" as const, text: `Blueprint created: ${id}\n\n${summary}` }],
        details: { blueprint_id: id, phases: phases.length, tasks: allTasks.length } as Record<string, unknown>,
      };
    },
  });

  pi.registerTool({
    name: "blueprint_status" as const,
    label: "Blueprint Status",
    description: "Get the current blueprint progress, active phase, and task status",
    promptSnippet: "Check current blueprint plan progress",
    parameters: StatusParams,
    promptGuidelines: guidelines,
    async execute() {
      const state = stateRef.get();
      if (!state.blueprint) {
        return {
          content: [{ type: "text" as const, text: "No active blueprint." }],
          details: { has_blueprint: false } as Record<string, unknown>,
        };
      }

      const summary = renderPlanMarkdown(state.blueprint);
      return {
        content: [{ type: "text" as const, text: summary }],
        details: {
          blueprint_id: state.blueprint.id,
          status: state.blueprint.status,
          active_phase: state.blueprint.active_phase_id,
          active_task: state.blueprint.active_task_id,
        } as Record<string, unknown>,
      };
    },
  });

  pi.registerTool({
    name: "blueprint_update" as const,
    label: "Update Blueprint",
    description: "Update a blueprint task status (mark as completed, in_progress, or skipped)",
    promptSnippet: "Mark a blueprint task as completed or update its status",
    parameters: UpdateParams,
    promptGuidelines: guidelines,
    async execute(
      _toolCallId: string,
      params: { task_id: string; status: "in_progress" | "completed" | "skipped"; notes?: string },
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      _ctx: unknown,
    ) {
      const state = stateRef.get();
      if (!state.blueprint) {
        return {
          content: [{ type: "text" as const, text: "No active blueprint." }],
          details: { error: "no_blueprint" } as Record<string, unknown>,
        };
      }

      let bp = state.blueprint;
      const allTasks = getAllTasks(bp.phases);
      const task = allTasks.find((t) => t.id === params.task_id);
      if (!task) {
        return {
          content: [{ type: "text" as const, text: `Task ${params.task_id} not found.` }],
          details: { error: "task_not_found" } as Record<string, unknown>,
        };
      }

      switch (params.status) {
        case "in_progress":
          bp = startTask(bp, params.task_id, state.sessionId);
          break;
        case "completed":
          bp = completeTask(bp, params.task_id);
          break;
        case "skipped":
          bp = skipTask(bp, params.task_id);
          break;
      }

      if (params.notes) {
        bp = {
          ...bp,
          phases: bp.phases.map((p) => ({
            ...p,
            tasks: p.tasks.map((t) =>
              t.id === params.task_id ? { ...t, notes: params.notes ?? null } : t,
            ),
          })),
        };
      }

      saveBlueprint(bp);
      appendHistory(bp.id, {
        timestamp: new Date().toISOString(),
        event: params.status === "completed" ? "task_completed"
          : params.status === "skipped" ? "task_skipped"
          : "task_started",
        phase_id: bp.active_phase_id,
        task_id: params.task_id,
        session_id: state.sessionId,
        details: params.notes ?? `Task ${params.task_id} -> ${params.status}`,
      });

      stateRef.set({ ...state, blueprint: bp });

      const next = getNextTask(bp);
      const nextInfo = next ? `\nNext task: ${next.id} - ${next.title}` : "\nNo more tasks.";
      return {
        content: [{
          type: "text" as const,
          text: `Task ${params.task_id} updated to ${params.status}.${nextInfo}`,
        }],
        details: {
          task_id: params.task_id,
          new_status: params.status,
          next_task: next?.id ?? null,
          blueprint_status: bp.status,
        } as Record<string, unknown>,
      };
    },
  });

  pi.registerTool({
    name: "blueprint_next" as const,
    label: "Next Blueprint Task",
    description: "Get the next actionable task from the active blueprint",
    promptSnippet: "Get the next task to work on",
    parameters: NextParams,
    promptGuidelines: guidelines,
    async execute() {
      const state = stateRef.get();
      if (!state.blueprint) {
        return {
          content: [{ type: "text" as const, text: "No active blueprint." }],
          details: { has_blueprint: false } as Record<string, unknown>,
        };
      }

      const next = getNextTask(state.blueprint);
      if (!next) {
        return {
          content: [{
            type: "text" as const,
            text: state.blueprint.status === "completed"
              ? "Blueprint is complete. All tasks and verifications are done."
              : "No actionable tasks. Some may be blocked or awaiting verification.",
          }],
          details: { blueprint_status: state.blueprint.status } as Record<string, unknown>,
        };
      }

      const lines = [
        `## Next Task: ${next.id} - ${next.title}`,
        "",
        next.description,
      ];

      if (next.acceptance_criteria.length > 0) {
        lines.push("", "**Acceptance criteria:**");
        for (const c of next.acceptance_criteria) {
          lines.push(`- ${c}`);
        }
      }

      if (next.file_targets.length > 0) {
        lines.push("", "**File targets:**");
        for (const f of next.file_targets) {
          lines.push(`- ${f}`);
        }
      }

      if (next.dependencies.length > 0) {
        lines.push("", `**Dependencies:** ${next.dependencies.join(", ")} (all completed)`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        details: { task_id: next.id, phase_id: state.blueprint.active_phase_id } as Record<string, unknown>,
      };
    },
  });
}

interface RawPhase {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly tasks: readonly RawTask[];
  readonly verification_gates: readonly RawGate[];
}

interface RawTask {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly acceptance_criteria: readonly string[];
  readonly file_targets: readonly string[];
  readonly dependencies: readonly string[];
}

interface RawGate {
  readonly type: "tests_pass" | "typecheck_clean" | "user_approval" | "custom_command";
  readonly description: string;
  readonly command?: string;
}

function buildPhases(raw: readonly RawPhase[]): Phase[] {
  return raw.map((rp): Phase => ({
    id: rp.id,
    title: rp.title,
    description: rp.description,
    status: "pending",
    tasks: rp.tasks.map((rt): Task => ({
      id: rt.id,
      title: rt.title,
      description: rt.description,
      status: "pending",
      acceptance_criteria: [...rt.acceptance_criteria],
      file_targets: [...rt.file_targets],
      dependencies: [...rt.dependencies],
      started_at: null,
      completed_at: null,
      session_id: null,
      notes: null,
    })),
    verification_gates: rp.verification_gates.map((rg): VerificationGate => ({
      type: rg.type,
      command: rg.command ?? null,
      description: rg.description,
      passed: false,
      last_checked_at: null,
      error_message: null,
    })),
    started_at: null,
    completed_at: null,
  }));
}
