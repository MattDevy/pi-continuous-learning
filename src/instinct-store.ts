/**
 * Instinct CRUD operations.
 * Provides functions to load, save, list, and delete instinct files from disk.
 * Path traversal prevention: instinct IDs must be kebab-case (no ".." possible).
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Instinct } from "./types.js";
import { parseInstinct, serializeInstinct } from "./instinct-parser.js";
import {
  getBaseDir,
  getProjectInstinctsDir,
  getGlobalInstinctsDir,
} from "./storage.js";

const INSTINCT_EXTENSION = ".md";

/**
 * Guard against path traversal attacks in instinct IDs.
 * Kebab-case validation in parseInstinct already prevents "..", but this
 * provides an explicit defense for direct callers of save/load by file path.
 */
function assertNoPathTraversal(id: string): void {
  if (id.includes("..") || id.includes("/") || id.includes("\\")) {
    throw new Error(
      `Invalid instinct ID "${id}": path traversal characters are not allowed.`
    );
  }
}

/**
 * Load a single instinct from a .md file path.
 */
export function loadInstinct(filePath: string): Instinct {
  const content = readFileSync(filePath, "utf-8");
  return parseInstinct(content);
}

/**
 * Save an instinct to <dir>/<id>.md.
 * Validates the instinct ID against path traversal before writing.
 */
export function saveInstinct(instinct: Instinct, dir: string): void {
  assertNoPathTraversal(instinct.id);
  const filePath = join(dir, `${instinct.id}${INSTINCT_EXTENSION}`);
  const content = serializeInstinct(instinct);
  writeFileSync(filePath, content, "utf-8");
}

/**
 * List and load all instincts from a directory.
 * Silently skips files that fail to parse (malformed instinct files).
 */
export function listInstincts(dir: string): Instinct[] {
  if (!existsSync(dir)) {
    return [];
  }

  const files = readdirSync(dir).filter((f) => f.endsWith(INSTINCT_EXTENSION));
  const instincts: Instinct[] = [];

  for (const file of files) {
    try {
      const instinct = loadInstinct(join(dir, file));
      instincts.push(instinct);
    } catch {
      // Skip malformed instinct files - do not crash the caller
    }
  }

  return instincts;
}

/**
 * Load all personal instincts for a specific project.
 */
export function loadProjectInstincts(
  projectId: string,
  baseDir = getBaseDir()
): Instinct[] {
  const dir = getProjectInstinctsDir(projectId, "personal", baseDir);
  return listInstincts(dir);
}

/**
 * Load all global personal instincts.
 */
export function loadGlobalInstincts(baseDir = getBaseDir()): Instinct[] {
  const dir = getGlobalInstinctsDir("personal", baseDir);
  return listInstincts(dir);
}
