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
import { AnalyzeLogger, type ProjectRunStats, type RunSummary } from "./analyze-logger.js";

// ---------------------------------------------------------------------------
// Lockfile guard - ensures only one instance runs at a time
// ---------------------------------------------------------------------------

const LOCKFILE_NAME = "analyze.lock";
const LOCK_STALE_MS = 10 * 60 * 1000; // 10 minutes - stale lock threshold

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
        // Process alive but lock is stale - treat as abandoned
      } catch {
        // Process is dead - lock is orphaned, safe to take over
      }
    } catch {
      // Malformed lockfile - remove and proceed
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
    // Best effort - don't crash on cleanup
  }
}

// ---------------------------------------------------------------------------
// Global timeout
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes total

function startGlobalTimeout(timeoutMs: number, logger: AnalyzeLogger): void {
  setTimeout(() => {
    logger.error("Global timeout reached, forcing exit");
    process.exit(2);
  }, timeoutMs).unref();
}

// ---------------------------------------------------------------------------
// Instinct operation tracking
// ---------------------------------------------------------------------------

interface InstinctOpCounts {
  created: number;
  updated: number;
  deleted: number;
}

/**
 * Wraps instinct tools to count create/update/delete operations.
 * Returns new tool instances that increment the provided counts.
 */
function wrapInstinctToolsWithTracking(
  projectId: string,
  projectName: string,
  baseDir: string,
  counts: InstinctOpCounts
) {
  const writeTool = createInstinctWriteTool(projectId, projectName, baseDir);
  const deleteTool = createInstinctDeleteTool(projectId, baseDir);

  const trackedWrite = {
    ...writeTool,
    async execute(
      toolCallId: string,
      params: Parameters<typeof writeTool.execute>[1],
      signal: AbortSignal | undefined,
      onUpdate: unknown,
      ctx: unknown
    ) {
      const result = await writeTool.execute(toolCallId, params, signal, onUpdate, ctx);
      const details = result.details as { action?: string } | undefined;
      if (details?.action === "created") {
        counts.created++;
      } else {
        counts.updated++;
      }
      return result;
    },
  };

  const trackedDelete = {
    ...deleteTool,
    async execute(
      toolCallId: string,
      params: Parameters<typeof deleteTool.execute>[1],
      signal: AbortSignal | undefined,
      onUpdate: unknown,
      ctx: unknown
    ) {
      const result = await deleteTool.execute(toolCallId, params, signal, onUpdate, ctx);
      counts.deleted++;
      return result;
    },
  };

  return {
    listTool: createInstinctListTool(projectId, baseDir),
    readTool: createInstinctReadTool(projectId, baseDir),
    writeTool: trackedWrite,
    deleteTool: trackedDelete,
  };
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

interface AnalyzeResult {
  readonly ran: boolean;
  readonly stats?: ProjectRunStats;
  readonly skippedReason?: string;
}

async function analyzeProject(
  project: ProjectEntry,
  config: ReturnType<typeof loadConfig>,
  baseDir: string,
  logger: AnalyzeLogger
): Promise<AnalyzeResult> {
  const meta = loadProjectMeta(project.id, baseDir);

  if (!hasNewObservations(project.id, meta, baseDir)) {
    return { ran: false, skippedReason: "no new observations" };
  }

  const obsPath = getObservationsPath(project.id, baseDir);
  const sinceLineCount = meta.last_observation_line_count ?? 0;
  const { lines: newObsLines, totalLineCount } = tailObservationsSince(obsPath, sinceLineCount);

  if (newObsLines.length === 0) {
    return { ran: false, skippedReason: "no new observation lines" };
  }

  const obsCount = countObservations(project.id, baseDir);
  if (obsCount < config.min_observations_to_analyze) {
    return { ran: false, skippedReason: `below threshold (${obsCount}/${config.min_observations_to_analyze})` };
  }

  const startTime = Date.now();
  logger.projectStart(project.id, project.name, newObsLines.length, obsCount);

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
    // Skills loading is best-effort - continue without them
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

  // Track instinct operations
  const instinctCounts: InstinctOpCounts = { created: 0, updated: 0, deleted: 0 };
  const trackedTools = wrapInstinctToolsWithTracking(project.id, project.name, baseDir, instinctCounts);

  const customTools = [
    trackedTools.listTool,
    trackedTools.readTool,
    trackedTools.writeTool,
    trackedTools.deleteTool,
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

  // Collect stats after session completes
  const sessionStats = session.getSessionStats();
  const durationMs = Date.now() - startTime;

  const stats: ProjectRunStats = {
    project_id: project.id,
    project_name: project.name,
    duration_ms: durationMs,
    observations_processed: newObsLines.length,
    observations_total: obsCount,
    instincts_created: instinctCounts.created,
    instincts_updated: instinctCounts.updated,
    instincts_deleted: instinctCounts.deleted,
    tokens_input: sessionStats.tokens.input,
    tokens_output: sessionStats.tokens.output,
    tokens_cache_read: sessionStats.tokens.cacheRead,
    tokens_cache_write: sessionStats.tokens.cacheWrite,
    tokens_total: sessionStats.tokens.total,
    cost_usd: sessionStats.cost,
    model: modelId,
  };

  logger.projectComplete(stats);

  saveProjectMeta(
    project.id,
    { ...meta, last_analyzed_at: new Date().toISOString(), last_observation_line_count: totalLineCount },
    baseDir
  );

  return { ran: true, stats };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const baseDir = getBaseDir();
  const config = loadConfig();
  const logger = new AnalyzeLogger(config.log_path);

  if (!acquireLock(baseDir)) {
    logger.info("Another instance is already running, exiting");
    process.exit(0);
  }

  startGlobalTimeout(DEFAULT_TIMEOUT_MS, logger);

  const runStart = Date.now();

  try {
    const registry = loadProjectsRegistry(baseDir);
    const projects = Object.values(registry);

    if (projects.length === 0) {
      logger.info("No projects registered");
      return;
    }

    logger.runStart(projects.length);

    let processed = 0;
    let skipped = 0;
    let errored = 0;
    const allProjectStats: ProjectRunStats[] = [];

    for (const project of projects) {
      try {
        const result = await analyzeProject(project, config, baseDir, logger);
        if (result.ran && result.stats) {
          processed++;
          allProjectStats.push(result.stats);
        } else {
          skipped++;
          if (result.skippedReason) {
            logger.projectSkipped(project.id, project.name, result.skippedReason);
          }
        }
      } catch (err) {
        errored++;
        logger.projectError(project.id, project.name, err);
      }
    }

    const summary: RunSummary = {
      total_duration_ms: Date.now() - runStart,
      projects_processed: processed,
      projects_skipped: skipped,
      projects_errored: errored,
      projects_total: projects.length,
      total_tokens: allProjectStats.reduce((sum, s) => sum + s.tokens_total, 0),
      total_cost_usd: allProjectStats.reduce((sum, s) => sum + s.cost_usd, 0),
      total_instincts_created: allProjectStats.reduce((sum, s) => sum + s.instincts_created, 0),
      total_instincts_updated: allProjectStats.reduce((sum, s) => sum + s.instincts_updated, 0),
      total_instincts_deleted: allProjectStats.reduce((sum, s) => sum + s.instincts_deleted, 0),
      project_stats: allProjectStats,
    };

    logger.runComplete(summary);
  } finally {
    releaseLock(baseDir);
  }
}

main().catch((err) => {
  releaseLock(getBaseDir());
  // Last-resort logging - config may not have loaded
  const logger = new AnalyzeLogger();
  logger.error("Fatal error", err);
  process.exit(1);
});
