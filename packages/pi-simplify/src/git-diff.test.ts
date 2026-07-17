import { describe, it, expect, vi } from "vitest";
import { getChangedFiles } from "./git-diff.js";
import type { SimplifyOptions } from "./types.js";

function makePi(execResults: Record<string, { stdout: string; stderr: string; code: number }>) {
  return {
    exec: vi.fn((_cmd: string, args: string[]) => {
      const key = args.join(" ");
      for (const [pattern, result] of Object.entries(execResults)) {
        if (key.includes(pattern)) return Promise.resolve(result);
      }
      if (args.includes("--unified=0")) {
        return Promise.resolve({ stdout: "", stderr: "", code: 0 });
      }
      return Promise.resolve({ stdout: "", stderr: "", code: 1 });
    }),
  } as unknown as Parameters<typeof getChangedFiles>[0];
}

const defaultOptions: SimplifyOptions = { files: [], ref: "HEAD", staged: false };

describe("getChangedFiles", () => {
  it("parses modified, added, renamed, and copied lines", async () => {
    const pi = makePi({
      "diff --name-status HEAD": {
        stdout: "M\tsrc/foo.ts\nA\tsrc/bar.ts\nR100\tsrc/old.ts\tsrc/new.ts\nC100\tsrc/a.ts\tsrc/b.ts\n",
        stderr: "",
        code: 0,
      },
    });

    const files = await getChangedFiles(pi, "/project", defaultOptions);

    expect(files).toEqual([
      { path: "src/foo.ts", status: "modified", changedLines: [] },
      { path: "src/bar.ts", status: "added" },
      { path: "src/new.ts", status: "renamed", changedLines: [] },
      { path: "src/b.ts", status: "copied", changedLines: [] },
    ]);
  });

  it("filters out deleted files", async () => {
    const pi = makePi({
      "diff --name-status HEAD": {
        stdout: "M\tsrc/keep.ts\nD\tsrc/gone.ts\n",
        stderr: "",
        code: 0,
      },
    });

    const files = await getChangedFiles(pi, "/project", defaultOptions);

    expect(files).toEqual([{ path: "src/keep.ts", status: "modified", changedLines: [] }]);
  });

  it("falls back to HEAD~1 when HEAD diff is empty", async () => {
    const pi = makePi({
      "diff --name-status HEAD~1": {
        stdout: "M\tsrc/recent.ts\n",
        stderr: "",
        code: 0,
      },
    });

    const files = await getChangedFiles(pi, "/project", defaultOptions);

    expect(files).toEqual([{ path: "src/recent.ts", status: "modified", changedLines: [] }]);
  });

  it("returns empty array when both HEAD and HEAD~1 diffs are empty", async () => {
    const pi = makePi({});

    const files = await getChangedFiles(pi, "/project", defaultOptions);

    expect(files).toEqual([]);
  });

  it("uses --cached when staged option is true", async () => {
    const pi = makePi({
      "diff --name-status --cached": {
        stdout: "M\tsrc/staged.ts\n",
        stderr: "",
        code: 0,
      },
    });

    const options: SimplifyOptions = { files: [], ref: "HEAD", staged: true };
    const files = await getChangedFiles(pi, "/project", options);

    expect(files).toEqual([{ path: "src/staged.ts", status: "modified", changedLines: [] }]);
    expect(pi.exec).toHaveBeenCalledWith(
      "git",
      ["diff", "--name-status", "--cached"],
      { cwd: "/project" },
    );
    expect(pi.exec).toHaveBeenCalledWith(
      "git",
      ["diff", "--unified=0", "--no-ext-diff", "--cached", "--", "src/staged.ts"],
      { cwd: "/project" },
    );
  });

  it("uses custom ref when provided", async () => {
    const pi = makePi({
      "diff --name-status main": {
        stdout: "A\tsrc/feature.ts\n",
        stderr: "",
        code: 0,
      },
    });

    const options: SimplifyOptions = { files: [], ref: "main", staged: false };
    const files = await getChangedFiles(pi, "/project", options);

    expect(files).toEqual([{ path: "src/feature.ts", status: "added" }]);
  });

  it("gets diffs for every file in an explicit file list", async () => {
    const pi = makePi({});

    const options: SimplifyOptions = {
      files: ["src/a.ts", "src/b.ts"],
      ref: "HEAD",
      staged: false,
    };
    const files = await getChangedFiles(pi, "/project", options);

    expect(files).toEqual([
      { path: "src/a.ts", status: "modified", changedLines: [] },
      { path: "src/b.ts", status: "modified", changedLines: [] },
    ]);
    expect(pi.exec).toHaveBeenCalledTimes(2);
  });

  it("handles blank lines in git output", async () => {
    const pi = makePi({
      "diff --name-status HEAD": {
        stdout: "M\tsrc/foo.ts\n\n\nA\tsrc/bar.ts\n",
        stderr: "",
        code: 0,
      },
    });

    const files = await getChangedFiles(pi, "/project", defaultOptions);

    expect(files).toEqual([
      { path: "src/foo.ts", status: "modified", changedLines: [] },
      { path: "src/bar.ts", status: "added" },
    ]);
  });

  it("extracts changed line ranges and ignores deletion-only hunks", async () => {
    const pi = makePi({
      "diff --name-status HEAD": {
        stdout: "M\tsrc/Foo.java\n",
        stderr: "",
        code: 0,
      },
      "diff --unified=0 --no-ext-diff HEAD -- src/Foo.java": {
        stdout: [
          "@@ -99,2 +100,3 @@",
          "@@ -104 +105,2 @@",
          "@@ -200 +202,0 @@",
        ].join("\n"),
        stderr: "",
        code: 0,
      },
    });

    const files = await getChangedFiles(pi, "/project", defaultOptions);

    expect(files).toEqual([{
      path: "src/Foo.java",
      status: "modified",
      changedLines: [{ start: 100, end: 102 }, { start: 105, end: 106 }],
    }]);
  });

  it("gets changed lines for explicitly supplied files", async () => {
    const pi = makePi({
      "diff --unified=0 --no-ext-diff HEAD -- src/Foo.java": {
        stdout: "@@ -99,21 +100,21 @@\n",
        stderr: "",
        code: 0,
      },
    });
    const options: SimplifyOptions = {
      files: ["src/Foo.java"],
      ref: "HEAD",
      staged: false,
    };

    const files = await getChangedFiles(pi, "/project", options);

    expect(files).toEqual([{
      path: "src/Foo.java",
      status: "modified",
      changedLines: [{ start: 100, end: 120 }],
    }]);
  });
});
