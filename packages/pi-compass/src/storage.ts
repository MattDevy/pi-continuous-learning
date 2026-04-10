import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { CodeMap, CodeTour, CacheEntry } from "./types.js";

export function getBaseDir(): string {
  return join(homedir(), ".pi", "compass");
}

export function getProjectDir(projectId: string, baseDir = getBaseDir()): string {
  return join(baseDir, "projects", projectId);
}

export function getCodemapPath(projectId: string, baseDir = getBaseDir()): string {
  return join(getProjectDir(projectId, baseDir), "codemap.json");
}

export function getToursDir(projectId: string, baseDir = getBaseDir()): string {
  return join(getProjectDir(projectId, baseDir), "tours");
}

export function getTourPath(projectId: string, topic: string, baseDir = getBaseDir()): string {
  return join(getToursDir(projectId, baseDir), `${topic}.json`);
}

export function ensureStorageLayout(projectId: string, baseDir = getBaseDir()): void {
  mkdirSync(getToursDir(projectId, baseDir), { recursive: true });
}

export function loadCachedCodemap(
  projectId: string,
  baseDir = getBaseDir(),
): CacheEntry<CodeMap> | null {
  try {
    const raw = readFileSync(getCodemapPath(projectId, baseDir), "utf-8");
    return JSON.parse(raw) as CacheEntry<CodeMap>;
  } catch {
    return null;
  }
}

export function saveCachedCodemap(
  projectId: string,
  entry: CacheEntry<CodeMap>,
  baseDir = getBaseDir(),
): void {
  writeFileSync(
    getCodemapPath(projectId, baseDir),
    JSON.stringify(entry, null, 2),
    "utf-8",
  );
}

export function loadCachedTour(
  projectId: string,
  topic: string,
  baseDir = getBaseDir(),
): CacheEntry<CodeTour> | null {
  try {
    const raw = readFileSync(getTourPath(projectId, topic, baseDir), "utf-8");
    return JSON.parse(raw) as CacheEntry<CodeTour>;
  } catch {
    return null;
  }
}

export function saveCachedTour(
  projectId: string,
  topic: string,
  entry: CacheEntry<CodeTour>,
  baseDir = getBaseDir(),
): void {
  writeFileSync(
    getTourPath(projectId, topic, baseDir),
    JSON.stringify(entry, null, 2),
    "utf-8",
  );
}
