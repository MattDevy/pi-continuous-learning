import { createHash } from "node:crypto";
import { basename } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ProjectInfo } from "./types.js";

function hashString(input: string): string {
  return createHash("sha256").update(input).digest("hex").substring(0, 12);
}

export async function detectProject(
  pi: ExtensionAPI,
  cwd: string,
): Promise<ProjectInfo> {
  const name = basename(cwd);

  const remoteResult = await pi.exec("git", ["remote", "get-url", "origin"], { cwd });
  if (remoteResult.code === 0) {
    const remote = remoteResult.stdout.trim();
    return { id: hashString(remote), name, root: cwd, remote };
  }

  const rootResult = await pi.exec("git", ["rev-parse", "--show-toplevel"], { cwd });
  if (rootResult.code === 0) {
    const root = rootResult.stdout.trim();
    return { id: hashString(root), name, root, remote: "" };
  }

  return { id: "global", name, root: cwd, remote: "" };
}
