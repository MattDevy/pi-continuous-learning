import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";

import { detectProject } from "./project.js";
import { ensureStorageLayout, loadCachedCodemap } from "./storage.js";
import { computeContentHash } from "./codemap-generator.js";
import {
  handleBeforeAgentStart as buildInjection,
  type BeforeAgentStartEvent,
} from "./codemap-injector.js";
import { handleOnboardCommand, COMMAND_NAME as ONBOARD_CMD } from "./onboard-command.js";
import { handleTourCommand, COMMAND_NAME as TOUR_CMD } from "./tour-command.js";
import { registerOnboardTools } from "./onboard-tools.js";
import type { CompassState } from "./types.js";

const DEFAULT_MAX_INJECTION_CHARS = 6000;

export default function (pi: ExtensionAPI): void {
  let state: CompassState = {
    project: null,
    turnCount: 0,
    codemapInjected: false,
    cachedCodemap: null,
    stale: false,
  };

  const stateRef = {
    get: () => state,
    set: (s: CompassState) => { state = s; },
  };

  pi.on("session_start", async (_event, ctx) => {
    try {
      const project = await detectProject(pi, ctx.cwd);
      ensureStorageLayout(project.id);

      const cached = loadCachedCodemap(project.id);
      let stale = false;
      if (cached) {
        const currentHash = computeContentHash(project.root);
        stale = cached.contentHash !== currentHash;
      }

      state = { ...state, project, cachedCodemap: cached, stale };

      registerOnboardTools(pi, stateRef);
    } catch (err) {
      console.error("[pi-compass] session_start error:", err);
    }
  });

  pi.on("before_agent_start", (event, _ctx) => {
    try {
      if (!state.project) return;
      const result = buildInjection(
        event as BeforeAgentStartEvent,
        state,
        DEFAULT_MAX_INJECTION_CHARS,
      );
      if (result) {
        state = { ...state, codemapInjected: true };
        return result;
      }
    } catch (err) {
      console.error("[pi-compass] before_agent_start error:", err);
    }
  });

  pi.on("turn_end", (_event, _ctx) => {
    try {
      state = { ...state, turnCount: state.turnCount + 1 };
    } catch (err) {
      console.error("[pi-compass] turn_end error:", err);
    }
  });

  pi.registerCommand(ONBOARD_CMD, {
    description: "Generate a structured codebase map for the current project",
    handler: (args: string, ctx: ExtensionCommandContext) =>
      handleOnboardCommand(args, ctx, pi, stateRef),
  });

  pi.registerCommand(TOUR_CMD, {
    description: "Take a guided tour of a specific area of the codebase",
    handler: (args: string, ctx: ExtensionCommandContext) =>
      handleTourCommand(args, ctx, pi, stateRef),
  });
}
