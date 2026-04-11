import { execSync } from "node:child_process";
import type { VerificationGate, VerificationResult } from "./types.js";

export function runGate(gate: VerificationGate, cwd: string): VerificationResult {
  if (gate.type === "user_approval") {
    return { passed: false, output: "Requires user approval", duration_ms: 0 };
  }

  const command = resolveCommand(gate);
  if (!command) {
    return { passed: false, output: `No command for gate type: ${gate.type}`, duration_ms: 0 };
  }

  const start = Date.now();
  try {
    const output = execSync(command, {
      cwd,
      encoding: "utf-8",
      timeout: 120_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { passed: true, output, duration_ms: Date.now() - start };
  } catch (err: unknown) {
    const duration_ms = Date.now() - start;
    const output = extractExecError(err);
    return { passed: false, output, duration_ms };
  }
}

export function runAllGates(
  gates: readonly VerificationGate[],
  cwd: string,
): readonly VerificationResult[] {
  return gates
    .filter((g) => g.type !== "user_approval")
    .map((gate) => runGate(gate, cwd));
}

function resolveCommand(gate: VerificationGate): string | null {
  switch (gate.type) {
    case "tests_pass":
      return "npm test";
    case "typecheck_clean":
      return "npx tsc --noEmit";
    case "custom_command":
      return gate.command;
    case "user_approval":
      return null;
  }
}

function extractExecError(err: unknown): string {
  if (err && typeof err === "object") {
    const obj = err as Record<string, unknown>;
    if (typeof obj["stderr"] === "string" && obj["stderr"]) return obj["stderr"];
    if (typeof obj["stdout"] === "string" && obj["stdout"]) return obj["stdout"];
    if (typeof obj["message"] === "string") return obj["message"];
  }
  return "Unknown error";
}
