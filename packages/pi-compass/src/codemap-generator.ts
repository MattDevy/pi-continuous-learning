import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { CodeMap, CacheEntry } from "./types.js";
import {
  buildDirectoryTree,
  detectPackages,
  detectFrameworks,
  detectEntryPoints,
  detectBuildScripts,
  detectConventions,
  detectKeyFiles,
} from "./analyzers/index.js";
import { loadCachedCodemap, saveCachedCodemap } from "./storage.js";

const HASH_FILES = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "go.mod",
  "go.sum",
  "Cargo.toml",
  "Cargo.lock",
  "pyproject.toml",
  "composer.json",
  "composer.lock",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
];

export function computeContentHash(cwd: string): string {
  const hash = createHash("sha256");

  for (const file of HASH_FILES) {
    try {
      hash.update(readFileSync(join(cwd, file), "utf-8"));
    } catch {
      // absent
    }
  }

  try {
    const entries = readdirSync(cwd).sort();
    hash.update(entries.join("\n"));
  } catch {
    // absent
  }

  return hash.digest("hex").substring(0, 16);
}

export function generateCodemap(
  cwd: string,
  projectId: string,
  projectName: string,
): CodeMap {
  const directoryTree = buildDirectoryTree(cwd);
  const packages = detectPackages(cwd);
  const frameworks = detectFrameworks(packages);
  const entryPoints = detectEntryPoints(cwd, packages);
  const buildScripts = detectBuildScripts(cwd);
  const conventions = detectConventions(cwd);
  const keyFiles = detectKeyFiles(cwd);

  return {
    projectId,
    projectName,
    generatedAt: new Date().toISOString(),
    contentHash: computeContentHash(cwd),
    directoryTree,
    packages,
    frameworks,
    entryPoints,
    buildScripts,
    conventions,
    keyFiles,
  };
}

export interface CodemapResult {
  readonly codemap: CodeMap;
  readonly fromCache: boolean;
  readonly stale: boolean;
}

export function getOrGenerateCodemap(
  cwd: string,
  projectId: string,
  projectName: string,
  baseDir?: string,
): CodemapResult {
  const cached = loadCachedCodemap(projectId, baseDir);
  if (cached) {
    const currentHash = computeContentHash(cwd);
    if (cached.contentHash === currentHash) {
      return { codemap: cached.data, fromCache: true, stale: false };
    }
    return { codemap: cached.data, fromCache: true, stale: true };
  }

  const codemap = generateCodemap(cwd, projectId, projectName);
  const entry: CacheEntry<CodeMap> = {
    data: codemap,
    contentHash: codemap.contentHash,
    createdAt: codemap.generatedAt,
  };
  saveCachedCodemap(projectId, entry, baseDir);
  return { codemap, fromCache: false, stale: false };
}
