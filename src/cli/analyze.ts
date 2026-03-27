#!/usr/bin/env node
import {
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import {
  createAgentSession,
  SessionManager,
  AuthStorage,
  ModelRegistry,
  DefaultResourceLoader,
} from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";

import { loadConfig, DEFAULT_CONFIG } from "../config.js";
import type { ProjectEntry } from "../types.js";
import {
  getBaseDir,
  getProjectsRegistryPath,
  getObservationsPath,
  getProjectDir,
} from "../storage.js";
import { countObservations } from "../observations.js";
import { runDecayPass } from "../instinct-decay.js";
import { buildAnalyzerUserPrompt, tailObservationsSince } from "../prompts/analyzer-user.js";
import { buildAnalyzerSystemPrompt } from "./analyze-prompt.js";
import {
  createInstinctListTool,
  createInstinctReadTool,
  createInstinctWriteTool,
  createInstinctDeleteTool,
} from "../instinct-tools.js";
import { readAgentsMd } from "../agents-md.js";
import { homedir } from "node:os";
import type { InstalledSkill } from "../types.js";

// ---------------------------------------------------------------------------
// Lockfile guard — ensures only one instance runs at a time
// ---------------------------------------------------------------------------

const LOCKFILE_NAME = "analyze.lock";
const LOCK_STALE_MS = 10 * 60 * 1000; // 10 minutes — stale lock threshold

function getLockfilePath(baseDir: string): string {
  return join(baseDir, LOCKFILE_NAME);
}

function acquireLock(baseDir: string): boolean {
  const lockPath = getLockfilePath(baseDir);

  if (existsSync(lockPath)) {
    try {
      const content = readFileSync(lockPath, "utf-8");
      const lock = JSON.parse(content) as { pid: number; started_at: string };
      const age = Date.now() - new Date(lock.started_at).getTime();

      // Check if the owning process is still alive
      try {
        process.kill(lock.pid, 0); // signal 0 = existence check, no actual signal
        if (age < LOCK_STALE_MS) {
          return false; // Process alive and lock is fresh
        }
        // Process alive but lock is stale — treat as abandoned
      } catch {
        // Process is dead — lock is orphaned, safe to take over
      }
    } catch {
      // Malformed lockfile — remove and proceed
    }
  }

  writeFileSync(
    lockPath,
    JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }),
    "utf-8"
  );
  return true;
}

function releaseLock(baseDir: string): void {
  const lockPath = getLockfilePath(baseDir);
  try {
    if (existsSync(lockPath)) unlinkSync(lockPath);
  } catch {
    // Best effort — don't crash on cleanup
  }
}

// ---------------------------------------------------------------------------
// Global timeout
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes total

function startGlobalTimeout(timeoutMs: number): void {
  setTimeout(() => {
    console.error("[analyze] Global timeout reached. Exiting.");
    process.exit(2);
  }, timeoutMs).unref();
}

// ---------------------------------------------------------------------------
// Per-project analysis
// ---------------------------------------------------------------------------

interface ProjectMeta {
  last_analyzed_at?: string;
  last_observation_line_count?: number;
}

function loadProjectsRegistry(baseDir: string): Record<string, ProjectEntry> {
  const path = getProjectsRegistryPath(baseDir);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, ProjectEntry>;
  } catch {
    return {};
  }
}

function loadProjectMeta(projectId: string, baseDir: string): ProjectMeta {
  const metaPath = join(getProjectDir(projectId, baseDir), "project.json");
  if (!existsSync(metaPath)) return {};
  try {
    return JSON.parse(readFileSync(metaPath, "utf-8")) as ProjectMeta;
  } catch {
    return {};
  }
}

function saveProjectMeta(projectId: string, meta: ProjectMeta, baseDir: string): void {
  const metaPath = join(getProjectDir(projectId, baseDir), "project.json");
  writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
}

function hasNewObservations(projectId: string, meta: ProjectMeta, baseDir: string): boolean {
  const obsPath = getObservationsPath(projectId, baseDir);
  if (!existsSync(obsPath)) return false;

  const stat = statSync(obsPath);
  if (meta.last_analyzed_at) {
    const lastAnalyzed = new Date(meta.last_analyzed_at).getTime();
    if (stat.mtimeMs <= lastAnalyzed) return false;
  }

  return true;
}

async function analyzeProject(
  project: ProjectEntry,
  config: ReturnType<typeof loadConfig>,
  baseDir: string
): Promise<boolean> {
  const meta = loadProjectMeta(project.id, baseDir);

  if (!hasNewObservations(project.id, meta, baseDir)) return false;

  const obsPath = getObservationsPath(project.id, baseDir);
  const sinceLineCount = meta.last_observation_line_count ?? 0;
  const { lines: newObsLines, totalLineCount } = tailObservationsSince(obsPath, sinceLineCount);

  if (newObsLines.length === 0) return false;

  const obsCount = countObservations(project.id, baseDir);
  if (obsCount < config.min_observations_to_analyze) return false;

  console.log(
    `[analyze] Processing ${project.name} (${project.id}): ${newObsLines.length} new observations (${obsCount} total)`
  );

  runDecayPass(project.id, baseDir);

  const instinctsDir = join(getProjectDir(project.id, baseDir), "instincts", "personal");

  const agentsMdProject = readAgentsMd(join(project.root, "AGENTS.md"));
  const agentsMdGlobal = readAgentsMd(join(homedir(), ".pi", "agent", "AGENTS.md"));

  let installedSkills: InstalledSkill[] = [];
  try {
    const { loadSkills } = await import("@mariozechner/pi-coding-agent");
    const result = loadSkills({ cwd: project.root });
    installedSkills = result.skills.map((s: { name: string; description: string }) => ({
      name: s.name,
      description: s.description,
    }));
  } catch {
    // Skills loading is best-effort — continue without them
  }

  const userPrompt = buildAnalyzerUserPrompt(obsPath, instinctsDir, project, {
    agentsMdProject,
    agentsMdGlobal,
    installedSkills,
    observationLines: newObsLines,
  });

  const authStorage = AuthStorage.create();
  const modelRegistry = new ModelRegistry(authStorage);
  const modelId = (config.model || DEFAULT_CONFIG.model) as Parameters<typeof getModel>[1];
  const model = getModel("anthropic", modelId);

  const customTools = [
    createInstinctListTool(project.id, baseDir),
    createInstinctReadTool(project.id, baseDir),
    createInstinctWriteTool(project.id, project.name, baseDir),
    createInstinctDeleteTool(project.id, baseDir),
  ];

  const loader = new DefaultResourceLoader({
    systemPromptOverride: () => buildAnalyzerSystemPrompt(),
  });
  await loader.reload();

  const { session } = await createAgentSession({
    model,
    authStorage,
    modelRegistry,
    sessionManager: SessionManager.inMemory(),
    customTools,
    resourceLoader: loader,
  });

  try {
    await session.prompt(userPrompt);
  } finally {
    session.dispose();
  }

  saveProjectMeta(
    project.id,
    { ...meta, last_analyzed_at: new Date().toISOString(), last_observation_line_count: totalLineCount },
    baseDir
  );
  console.log(`[analyze] Completed ${project.name}`);
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const baseDir = getBaseDir();

  if (!acquireLock(baseDir)) {
    console.log("[analyze] Another instance is already running. Exiting.");
    process.exit(0);
  }

  startGlobalTimeout(DEFAULT_TIMEOUT_MS);

  try {
    const config = loadConfig();
    const registry = loadProjectsRegistry(baseDir);
    const projects = Object.values(registry);

    if (projects.length === 0) {
      console.log("[analyze] No projects registered. Use pi with the continuous-learning extension first.");
      return;
    }

    let processed = 0;
    for (const project of projects) {
      try {
        const didRun = await analyzeProject(project, config, baseDir);
        if (didRun) processed++;
      } catch (err) {
        console.error(`[analyze] Error processing ${project.name}: ${String(err)}`);
      }
    }

    console.log(`[analyze] Done. Processed ${processed}/${projects.length} project(s).`);
  } finally {
    releaseLock(baseDir);
  }
}

main().catch((err) => {
  releaseLock(getBaseDir());
  console.error(`[analyze] Fatal error: ${String(err)}`);
  process.exit(1);
});
