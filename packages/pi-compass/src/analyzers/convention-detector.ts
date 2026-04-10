import { join } from "node:path";
import type { Convention } from "../types.js";
import { readTextFile } from "../fs-utils.js";

const MAX_CONTENT_LENGTH = 2000;

const CONVENTION_FILES: readonly string[] = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".editorconfig",
  "eslint.config.js",
  "eslint.config.ts",
  "eslint.config.mjs",
  ".eslintrc.json",
  ".eslintrc.js",
  ".eslintrc.yml",
  "prettier.config.js",
  "prettier.config.ts",
  ".prettierrc",
  ".prettierrc.json",
  "biome.json",
  "biome.jsonc",
  "rustfmt.toml",
  ".golangci.yml",
  ".golangci.yaml",
  "CONTRIBUTING.md",
  ".stylelintrc.json",
  "deno.json",
  "deno.jsonc",
];

export function detectConventions(cwd: string): readonly Convention[] {
  const results: Convention[] = [];

  for (const file of CONVENTION_FILES) {
    const content = readTextFile(join(cwd, file));
    if (content !== null) {
      results.push({
        source: file,
        content: truncate(content, MAX_CONTENT_LENGTH),
      });
    }
  }

  return results;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "\n... (truncated)";
}
