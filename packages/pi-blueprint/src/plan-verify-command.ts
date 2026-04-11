import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { StateRef } from "./types.js";
import { verifyGate, advancePhase } from "./state-machine.js";
import { runGate } from "./verification.js";
import { saveBlueprint, appendHistory } from "./storage.js";

export const COMMAND_NAME = "plan-verify";

export async function handlePlanVerifyCommand(
  _args: string,
  ctx: ExtensionCommandContext,
  stateRef: StateRef,
): Promise<void> {
  const state = stateRef.get();
  if (!state.blueprint) {
    ctx.ui.notify("No active blueprint.", "info");
    return;
  }

  const bp = state.blueprint;
  const phase = bp.phases.find((p) => p.id === bp.active_phase_id);
  if (!phase) {
    ctx.ui.notify("No active phase to verify.", "info");
    return;
  }

  if (phase.verification_gates.length === 0) {
    ctx.ui.notify(`Phase ${phase.id} has no verification gates. Advancing.`, "info");
    const advanced = advancePhase(bp);
    saveBlueprint(advanced);
    stateRef.set({ ...state, blueprint: advanced });
    return;
  }

  const cwd = state.project?.root ?? process.cwd();
  let updated = bp;
  const results: string[] = [];

  for (let i = 0; i < phase.verification_gates.length; i++) {
    const gate = phase.verification_gates[i]!;

    if (gate.type === "user_approval") {
      results.push(`- ${gate.description}: requires manual approval (skipped in automated run)`);
      continue;
    }

    ctx.ui.notify(`Running: ${gate.description}...`, "info");
    const result = runGate(gate, cwd);
    updated = verifyGate(updated, phase.id, i, result.passed, result.passed ? undefined : result.output);

    const status = result.passed ? "PASSED" : "FAILED";
    results.push(`- ${gate.description}: ${status} (${result.duration_ms}ms)`);

    appendHistory(updated.id, {
      timestamp: new Date().toISOString(),
      event: result.passed ? "verification_passed" : "verification_failed",
      phase_id: phase.id,
      task_id: null,
      session_id: state.sessionId,
      details: `${gate.description}: ${status}`,
    });
  }

  const currentPhase = updated.phases.find((p) => p.id === phase.id)!;
  const allPassed = currentPhase.verification_gates
    .filter((g) => g.type !== "user_approval")
    .every((g) => g.passed);

  if (allPassed) {
    const hasUserApproval = currentPhase.verification_gates.some((g) => g.type === "user_approval" && !g.passed);
    if (!hasUserApproval) {
      updated = advancePhase(updated);
      results.push("\nAll gates passed. Phase advanced.");
    } else {
      results.push("\nAutomated gates passed. User approval still required.");
    }
  }

  saveBlueprint(updated);
  stateRef.set({ ...state, blueprint: updated });
  ctx.ui.notify(`Verification results for Phase ${phase.id}:\n${results.join("\n")}`, "info");
}
