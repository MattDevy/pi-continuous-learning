import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { renderPlanMarkdown } from "./plan-renderer.js";
import type {
  Blueprint,
  BlueprintIndex,
  HistoryEntry,
  SessionsState,
} from "./types.js";

export function getBaseDir(baseDir?: string): string {
  return baseDir ?? join(homedir(), ".pi", "blueprints");
}

export function getBlueprintDir(blueprintId: string, baseDir?: string): string {
  return join(getBaseDir(baseDir), blueprintId);
}

export function ensureStorageLayout(blueprintId: string, baseDir?: string): void {
  const dir = getBlueprintDir(blueprintId, baseDir);
  mkdirSync(dir, { recursive: true });
}

export function ensureBaseDir(baseDir?: string): void {
  mkdirSync(getBaseDir(baseDir), { recursive: true });
}

export function loadIndex(baseDir?: string): BlueprintIndex | null {
  const path = join(getBaseDir(baseDir), "index.json");
  return readJson<BlueprintIndex>(path);
}

export function saveIndex(index: BlueprintIndex, baseDir?: string): void {
  ensureBaseDir(baseDir);
  const path = join(getBaseDir(baseDir), "index.json");
  writeFileSync(path, JSON.stringify(index, null, 2) + "\n");
}

export function loadBlueprint(blueprintId: string, baseDir?: string): Blueprint | null {
  const path = join(getBlueprintDir(blueprintId, baseDir), "state.json");
  return readJson<Blueprint>(path);
}

export function saveBlueprint(blueprint: Blueprint, baseDir?: string): void {
  ensureStorageLayout(blueprint.id, baseDir);
  const dir = getBlueprintDir(blueprint.id, baseDir);
  writeFileSync(join(dir, "state.json"), JSON.stringify(blueprint, null, 2) + "\n");
  writeFileSync(join(dir, "plan.md"), renderPlanMarkdown(blueprint));
}

export function appendHistory(
  blueprintId: string,
  entry: HistoryEntry,
  baseDir?: string,
): void {
  ensureStorageLayout(blueprintId, baseDir);
  const path = join(getBlueprintDir(blueprintId, baseDir), "history.jsonl");
  appendFileSync(path, JSON.stringify(entry) + "\n");
}

export function loadSessions(blueprintId: string, baseDir?: string): SessionsState | null {
  const path = join(getBlueprintDir(blueprintId, baseDir), "sessions.json");
  return readJson<SessionsState>(path);
}

export function saveSessions(
  blueprintId: string,
  sessions: SessionsState,
  baseDir?: string,
): void {
  ensureStorageLayout(blueprintId, baseDir);
  const path = join(getBlueprintDir(blueprintId, baseDir), "sessions.json");
  writeFileSync(path, JSON.stringify(sessions, null, 2) + "\n");
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}
