import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { StateRef } from "./types.js";
import { getOrGenerateCodemap } from "./codemap-generator.js";
import { formatCodemapMarkdown } from "./codemap-formatter.js";
import { detectAvailableTopics, getOrGenerateTour, formatTourMarkdown } from "./tour-generator.js";

const CodemapParams = Type.Object({});

const TourParams = Type.Object({
  topic: Type.Optional(
    Type.String({ description: "Tour topic (e.g., 'auth', 'api', 'testing'). Omit to list available topics." }),
  ),
});

function createCodemapTool(stateRef: StateRef) {
  return {
    name: "codebase_map" as const,
    label: "Codebase Map",
    description: "Returns a structured map of the current codebase including directory tree, packages, frameworks, entry points, build scripts, and conventions",
    promptSnippet: "Get or generate a structured map of the current codebase",
    parameters: CodemapParams,
    async execute(
      _toolCallId: string,
      _params: Record<string, never>,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      _ctx: unknown,
    ) {
      const state = stateRef.get();
      if (!state.project) {
        throw new Error("No project detected.");
      }

      const { codemap } = getOrGenerateCodemap(
        state.project.root,
        state.project.id,
        state.project.name,
      );

      const markdown = formatCodemapMarkdown(codemap);
      return {
        content: [{ type: "text" as const, text: markdown }],
        details: { projectId: codemap.projectId, contentHash: codemap.contentHash },
      };
    },
  };
}

function createTourTool(stateRef: StateRef) {
  return {
    name: "code_tour" as const,
    label: "Code Tour",
    description: "Returns a guided walkthrough of a specific area of the codebase, or lists available topics",
    promptSnippet: "Get a guided code tour for a specific topic or area",
    parameters: TourParams,
    async execute(
      _toolCallId: string,
      params: { topic?: string },
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      _ctx: unknown,
    ) {
      const state = stateRef.get();
      if (!state.project) {
        throw new Error("No project detected.");
      }

      const codemap = state.cachedCodemap?.data
        ?? getOrGenerateCodemap(state.project.root, state.project.id, state.project.name).codemap;

      if (!params.topic) {
        const topics = detectAvailableTopics(state.project.root, codemap);
        return {
          content: [{
            type: "text" as const,
            text: topics.length > 0
              ? `Available tour topics: ${topics.join(", ")}`
              : "No tour topics detected.",
          }],
          details: { topics } as Record<string, unknown>,
        };
      }

      const tour = getOrGenerateTour(
        state.project.root,
        params.topic,
        codemap,
        state.project.id,
      );

      return {
        content: [{ type: "text" as const, text: formatTourMarkdown(tour) }],
        details: { topic: tour.topic, steps: tour.steps.length } as Record<string, unknown>,
      };
    },
  };
}

export function registerOnboardTools(
  pi: ExtensionAPI,
  stateRef: StateRef,
): void {
  const guidelines = [
    "Use codebase_map to understand the overall project structure. Use code_tour to walk through specific areas in detail.",
  ];

  pi.registerTool({
    ...createCodemapTool(stateRef),
    promptGuidelines: guidelines,
  });
  pi.registerTool({
    ...createTourTool(stateRef),
    promptGuidelines: guidelines,
  });
}
