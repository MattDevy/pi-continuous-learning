/**
 * Spawns a Pi CLI subprocess for running the background analyzer.
 * Manages process creation, argument construction, and completion tracking.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { DEFAULT_CONFIG } from "./config.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PI_EXECUTABLE = "pi";

/**
 * Fixed CLI flags passed to every analyzer subprocess.
 * Order matches the acceptance criteria specification.
 */
const ANALYZER_FLAGS = [
  "--mode",
  "json",
  "-p",
  "--no-session",
  "--tools",
  "read,write",
  "--no-extensions",
  "--no-skills",
  "--no-prompt-templates",
  "--no-themes",
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Handle returned by spawnAnalyzer for process management. */
export interface SpawnAnalyzerHandle {
  /** The spawned child process. */
  process: ChildProcess;
  /** Resolves with exit code when the process closes. */
  completion: Promise<number | null>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Builds the argument list for the Pi CLI analyzer subprocess.
 * Exported for unit testing.
 */
export function buildAnalyzerArgs(
  systemPromptFile: string,
  userPrompt: string,
  model: string
): string[] {
  return [
    ...ANALYZER_FLAGS,
    "--model",
    model,
    "--append-system-prompt",
    systemPromptFile,
    userPrompt,
  ];
}

/**
 * Spawns the Pi CLI analyzer subprocess.
 *
 * @param systemPromptFile - Absolute path to the system prompt file.
 * @param userPrompt - The user prompt string passed as final positional arg.
 * @param cwd - Working directory for the subprocess.
 * @param model - Model to use (defaults to config default: claude-haiku-4-5).
 * @returns A handle with the child process and a completion promise.
 */
export function spawnAnalyzer(
  systemPromptFile: string,
  userPrompt: string,
  cwd: string,
  model: string = DEFAULT_CONFIG.model
): SpawnAnalyzerHandle {
  const args = buildAnalyzerArgs(systemPromptFile, userPrompt, model);

  const child = spawn(PI_EXECUTABLE, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const completion = new Promise<number | null>((resolve) => {
    child.on("close", (code) => {
      resolve(code);
    });
  });

  return { process: child, completion };
}
