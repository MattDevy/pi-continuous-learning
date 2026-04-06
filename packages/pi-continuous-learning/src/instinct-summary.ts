/**
 * Generates human-readable INSTINCT_SUMMARY.md files for browsing instincts
 * outside of Pi sessions.
 *
 * Global summary: ~/.pi/continuous-learning/INSTINCT_SUMMARY.md
 * Per-project:    ~/.pi/continuous-learning/projects/<id>/INSTINCT_SUMMARY.md
 */

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import type { Instinct, ProjectEntry } from "./types.js";
import {
  loadProjectInstincts,
  loadGlobalInstincts,
} from "./instinct-store.js";
import {
  getBaseDir,
  getProjectsRegistryPath,
  getGlobalSummaryPath,
  getProjectSummaryPath,
} from "./storage.js";

function loadProjectsRegistry(
  baseDir: string,
): Record<string, ProjectEntry> {
  const path = getProjectsRegistryPath(baseDir);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<
      string,
      ProjectEntry
    >;
  } catch {
    return {};
  }
}

function formatTable(instincts: Instinct[]): string {
  const sorted = [...instincts].sort((a, b) => b.confidence - a.confidence);
  const rows = sorted.map(
    (i) =>
      `| ${i.id} | ${i.title} | ${i.confidence.toFixed(2)} | ${i.domain} |`,
  );
  return [
    "| ID | Title | Confidence | Domain |",
    "|----|-------|-----------|--------|",
    ...rows,
  ].join("\n");
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * Regenerates the global INSTINCT_SUMMARY.md covering all global instincts
 * and every registered project's instincts.
 */
export function generateGlobalSummary(baseDir = getBaseDir()): void {
  const globalInstincts = loadGlobalInstincts(baseDir);
  const registry = loadProjectsRegistry(baseDir);
  const projectEntries = Object.values(registry).map((project) => ({
    project,
    instincts: loadProjectInstincts(project.id, baseDir),
  }));

  const lines: string[] = [
    "# Instinct Summary",
    `*Generated: ${new Date().toISOString()}*`,
    "",
    `## Global (${plural(globalInstincts.length, "instinct")})`,
    "",
  ];

  if (globalInstincts.length === 0) {
    lines.push("*No global instincts yet.*");
  } else {
    lines.push(formatTable(globalInstincts));
  }

  for (const { project, instincts } of projectEntries) {
    lines.push(
      "",
      `## Project: ${project.name} (${plural(instincts.length, "instinct")})`,
      "",
    );
    if (instincts.length === 0) {
      lines.push("*No project-scoped instincts yet.*");
    } else {
      lines.push(formatTable(instincts));
    }
  }

  try {
    writeFileSync(getGlobalSummaryPath(baseDir), lines.join("\n") + "\n", "utf-8");
  } catch {
    // Best effort - don't crash callers on I/O failure
  }
}

/**
 * Regenerates the per-project INSTINCT_SUMMARY.md for a single project.
 */
export function generateProjectSummary(
  projectId: string,
  baseDir = getBaseDir(),
): void {
  const instincts = loadProjectInstincts(projectId, baseDir);
  const registry = loadProjectsRegistry(baseDir);
  const projectName = registry[projectId]?.name ?? projectId;

  const lines: string[] = [
    `# Instinct Summary: ${projectName}`,
    `*Generated: ${new Date().toISOString()}*`,
    "",
    `## ${plural(instincts.length, "instinct")}`,
    "",
  ];

  if (instincts.length === 0) {
    lines.push("*No project-scoped instincts yet.*");
  } else {
    lines.push(formatTable(instincts));
  }

  try {
    writeFileSync(
      getProjectSummaryPath(projectId, baseDir),
      lines.join("\n") + "\n",
      "utf-8",
    );
  } catch {
    // Best effort - don't crash callers on I/O failure
  }
}
