import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BuildScript } from "../types.js";

const INTERESTING_SCRIPTS = new Set([
  "build", "dev", "start", "test", "lint", "check",
  "typecheck", "format", "deploy", "clean", "serve",
  "preview", "generate", "migrate", "seed",
]);

export function detectBuildScripts(cwd: string): readonly BuildScript[] {
  const results: BuildScript[] = [];

  results.push(...extractNpmScripts(cwd));
  results.push(...extractMakefileTargets(cwd));
  results.push(...detectCiFiles(cwd));
  results.push(...detectContainerFiles(cwd));

  return results;
}

function extractNpmScripts(cwd: string): BuildScript[] {
  try {
    const raw = readFileSync(join(cwd, "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    const scripts = pkg["scripts"];
    if (!scripts || typeof scripts !== "object") return [];

    return Object.entries(scripts as Record<string, unknown>)
      .filter(([name]) => INTERESTING_SCRIPTS.has(name))
      .map(([name, cmd]) => ({
        name,
        command: typeof cmd === "string" ? cmd : String(cmd),
        source: "package.json",
      }));
  } catch {
    return [];
  }
}

function extractMakefileTargets(cwd: string): BuildScript[] {
  const makefilePath = join(cwd, "Makefile");
  try {
    const content = readFileSync(makefilePath, "utf-8");
    const targets = [...content.matchAll(/^([a-zA-Z_][\w-]*)\s*:/gm)];
    return targets
      .filter(([, name]) => name && !name.startsWith("."))
      .map(([, name]) => ({
        name: name!,
        command: `make ${name}`,
        source: "Makefile",
      }));
  } catch {
    return [];
  }
}

function detectCiFiles(cwd: string): BuildScript[] {
  const results: BuildScript[] = [];

  if (existsSync(join(cwd, ".github", "workflows"))) {
    results.push({ name: "ci", command: "GitHub Actions", source: ".github/workflows/" });
  }
  if (existsSync(join(cwd, ".gitlab-ci.yml"))) {
    results.push({ name: "ci", command: "GitLab CI", source: ".gitlab-ci.yml" });
  }
  if (existsSync(join(cwd, "Jenkinsfile"))) {
    results.push({ name: "ci", command: "Jenkins", source: "Jenkinsfile" });
  }

  return results;
}

function detectContainerFiles(cwd: string): BuildScript[] {
  const results: BuildScript[] = [];

  if (existsSync(join(cwd, "Dockerfile"))) {
    results.push({ name: "docker", command: "docker build", source: "Dockerfile" });
  }
  if (existsSync(join(cwd, "docker-compose.yml")) || existsSync(join(cwd, "docker-compose.yaml"))) {
    results.push({ name: "docker-compose", command: "docker compose up", source: "docker-compose.yml" });
  }

  return results;
}
