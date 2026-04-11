import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import type { BlueprintExtensionState } from "./types.js";
import {
  ensureBaseDir,
  loadIndex,
  loadBlueprint,
  saveBlueprint,
} from "./storage.js";
import { buildInjectionBlock } from "./blueprint-injector.js";
import { registerBlueprintTools } from "./blueprint-tools.js";
import {
  handleBlueprintCommand,
  COMMAND_NAME as BLUEPRINT_CMD,
} from "./blueprint-command.js";
import {
  handlePlanStatusCommand,
  COMMAND_NAME as STATUS_CMD,
} from "./plan-status-command.js";
import {
  handlePlanVerifyCommand,
  COMMAND_NAME as VERIFY_CMD,
} from "./plan-verify-command.js";
import {
  handlePlanNextCommand,
  COMMAND_NAME as NEXT_CMD,
} from "./plan-next-command.js";

export default function (pi: ExtensionAPI): void {
  let state: BlueprintExtensionState = {
    project: null,
    blueprint: null,
    sessionId: "",
  };
  let dirty = false;

  const stateRef = {
    get: () => state,
    set: (s: BlueprintExtensionState) => {
      state = s;
      dirty = true;
    },
  };

  pi.on("session_start", (_event, _ctx) => {
    try {
      ensureBaseDir();
      const index = loadIndex();
      if (index?.active_blueprint_id) {
        const blueprint = loadBlueprint(index.active_blueprint_id);
        if (blueprint && blueprint.status === "active") {
          state = { ...state, blueprint };
        }
      }
      registerBlueprintTools(pi, stateRef);
    } catch (err) {
      console.error("[pi-blueprint] session_start error:", err);
    }
  });

  pi.on("session_shutdown", (_event, _ctx) => {
    try {
      if (state.blueprint) {
        saveBlueprint(state.blueprint);
      }
    } catch (err) {
      console.error("[pi-blueprint] session_shutdown error:", err);
    }
  });

  pi.on("before_agent_start", (event, _ctx) => {
    try {
      const block = buildInjectionBlock(state.blueprint);
      if (!block) return;
      const e = event as { systemPrompt?: string };
      return { systemPrompt: (e.systemPrompt ?? "") + block };
    } catch (err) {
      console.error("[pi-blueprint] before_agent_start error:", err);
    }
  });

  pi.on("turn_end", (_event, _ctx) => {
    try {
      if (state.blueprint && dirty) {
        saveBlueprint(state.blueprint);
        dirty = false;
      }
    } catch (err) {
      console.error("[pi-blueprint] turn_end error:", err);
    }
  });

  pi.registerCommand(BLUEPRINT_CMD, {
    description: "Create or manage a multi-session blueprint plan",
    handler: (args: string, ctx: ExtensionCommandContext) =>
      handleBlueprintCommand(args, ctx, stateRef, pi),
  });

  pi.registerCommand(STATUS_CMD, {
    description: "Show detailed blueprint progress",
    handler: (args: string, ctx: ExtensionCommandContext) =>
      handlePlanStatusCommand(args, ctx, stateRef),
  });

  pi.registerCommand(VERIFY_CMD, {
    description: "Run verification gates for the current phase",
    handler: (args: string, ctx: ExtensionCommandContext) =>
      handlePlanVerifyCommand(args, ctx, stateRef),
  });

  pi.registerCommand(NEXT_CMD, {
    description: "Get and start the next blueprint task",
    handler: (args: string, ctx: ExtensionCommandContext) =>
      handlePlanNextCommand(args, ctx, stateRef, pi),
  });
}
