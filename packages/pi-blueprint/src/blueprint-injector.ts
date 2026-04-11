import type { Blueprint } from "./types.js";
import { buildPhaseContext } from "./prompts/phase-context.js";

export function buildInjectionBlock(blueprint: Blueprint | null): string | null {
  if (!blueprint) return null;
  if (blueprint.status !== "active") return null;
  if (!blueprint.active_phase_id) return null;

  return "\n\n" + buildPhaseContext(blueprint);
}
