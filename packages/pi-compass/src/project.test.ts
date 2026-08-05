import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, it, expect, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { detectProject } from "./project.js";

function hashString(input: string): string {
  return createHash("sha256").update(input).digest("hex").substring(0, 12);
}

function makeMockPi(execResults: Record<string, { code: number; stdout: string; stderr: string }>): ExtensionAPI {
  return {
    exec: vi.fn(async (cmd: string, args: string[]) => {
      const key = `${cmd} ${args.join(" ")}`;
      return execResults[key] ?? { code: 1, stdout: "", stderr: "not found" };
    }),
  } as unknown as ExtensionAPI;
}

describe("detectProject", () => {
  it("uses the git root and remote URL when invoked from a subdirectory", async () => {
    const pi = makeMockPi({
      "git rev-parse --show-toplevel": { code: 0, stdout: "/home/user/repo\n", stderr: "" },
      "git remote get-url origin": { code: 0, stdout: "https://github.com/user/repo.git\n", stderr: "" },
    });
    const project = await detectProject(pi, "/home/user/repo/packages/app");
    expect(project.name).toBe("repo");
    expect(project.remote).toBe("https://github.com/user/repo.git");
    expect(project.id).toBe(hashString("https://github.com/user/repo.git"));
    expect(project.root).toBe("/home/user/repo");
  });

  it("falls back to repo root when no remote", async () => {
    const pi = makeMockPi({
      "git rev-parse --show-toplevel": { code: 0, stdout: "/home/user/repo\n", stderr: "" },
    });
    const project = await detectProject(pi, "/home/user/repo");
    expect(project.id).toHaveLength(12);
    expect(project.remote).toBe("");
    expect(project.root).toBe("/home/user/repo");
  });

  it("hashes the absolute cwd when not in a git repo", async () => {
    const pi = makeMockPi({});
    const project = await detectProject(pi, "/tmp/scratch");
    expect(project.id).toBe(hashString(resolve("/tmp/scratch")));
    expect(project.id).not.toBe("global");
    expect(project.name).toBe("scratch");
    expect(project.root).toBe(resolve("/tmp/scratch"));
  });

  it("produces consistent hashes for the same remote", async () => {
    const pi = makeMockPi({
      "git rev-parse --show-toplevel": { code: 0, stdout: "/home/user/repo\n", stderr: "" },
      "git remote get-url origin": { code: 0, stdout: "https://github.com/user/repo.git\n", stderr: "" },
    });
    const p1 = await detectProject(pi, "/home/user/repo");
    const p2 = await detectProject(pi, "/home/user/repo");
    expect(p1.id).toBe(p2.id);
  });
});
