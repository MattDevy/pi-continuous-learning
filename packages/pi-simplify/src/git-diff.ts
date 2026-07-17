import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ChangedFile, LineRange, SimplifyOptions } from "./types.js";

const STATUS_MAP: Record<string, ChangedFile["status"]> = {
  M: "modified",
  A: "added",
  R: "renamed",
  C: "copied",
};

function parseDiffOutput(stdout: string): ChangedFile[] {
  const files: ChangedFile[] = [];

  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;

    const parts = line.split("\t");
    const statusCode = parts[0]?.[0];
    if (!statusCode) continue;

    const status = STATUS_MAP[statusCode];
    if (!status) continue;

    // Renamed (R100\told\tnew) and copied (C100\told\tnew) have two paths; use the new one.
    const path = (status === "renamed" || status === "copied") ? parts[2] : parts[1];
    if (path) {
      files.push({ path, status });
    }
  }

  return files;
}

function parseChangedLines(stdout: string): LineRange[] {
  const ranges: LineRange[] = [];

  for (const line of stdout.split("\n")) {
    const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!match?.[1]) continue;

    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    if (count === 0) continue;

    const end = start + count - 1;
    const previous = ranges.at(-1);
    if (previous && start <= previous.end + 1) {
      ranges[ranges.length - 1] = { start: previous.start, end: Math.max(previous.end, end) };
    } else {
      ranges.push({ start, end });
    }
  }

  return ranges;
}

function diffArgs(
  options: SimplifyOptions,
  ref: string,
  path: string,
): string[] {
  const args = ["diff", "--unified=0", "--no-ext-diff"];
  if (options.staged && ref !== "HEAD~1") {
    args.push("--cached");
  } else {
    args.push(ref);
  }
  args.push("--", path);
  return args;
}

async function addChangedLines(
  pi: ExtensionAPI,
  cwd: string,
  options: SimplifyOptions,
  files: readonly ChangedFile[],
  ref: string,
): Promise<ChangedFile[]> {
  return Promise.all(files.map(async (file) => {
    if (file.status === "added") return file;

    const result = await pi.exec("git", diffArgs(options, ref, file.path), { cwd });
    return result.code === 0
      ? { ...file, changedLines: parseChangedLines(result.stdout) }
      : file;
  }));
}

export async function getChangedFiles(
  pi: ExtensionAPI,
  cwd: string,
  options: SimplifyOptions,
): Promise<ChangedFile[]> {
  if (options.files.length > 0) {
    const files = options.files.map((path) => ({ path, status: "modified" as const }));
    return addChangedLines(pi, cwd, options, files, options.ref);
  }

  const args = ["diff", "--name-status"];
  if (options.staged) {
    args.push("--cached");
  } else {
    args.push(options.ref);
  }

  const result = await pi.exec("git", args, { cwd });
  if (result.code === 0) {
    const files = parseDiffOutput(result.stdout);
    if (files.length > 0) return addChangedLines(pi, cwd, options, files, options.ref);
  }

  // Fallback: diff against previous commit
  const fallback = await pi.exec("git", ["diff", "--name-status", "HEAD~1"], { cwd });
  if (fallback.code === 0) {
    const files = parseDiffOutput(fallback.stdout);
    return addChangedLines(pi, cwd, options, files, "HEAD~1");
  }

  return [];
}
