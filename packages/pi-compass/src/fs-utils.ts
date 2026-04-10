import { readFileSync } from "node:fs";

export function readTextFile(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

export function readJsonFile(path: string): Record<string, unknown> | null {
  const text = readTextFile(path);
  if (text === null) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}
