import { describe, it, expect, vi, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { handleTourCommand } from "./tour-command.js";
import type { StateRef } from "./types.js";
import type { CompassState, CodeMap, CacheEntry } from "./types.js";
import { ensureStorageLayout } from "./storage.js";

const tmpBase = mkdtempSync(join(tmpdir(), "compass-tourcmd-test-"));

afterAll(() => {
  rmSync(tmpBase, { recursive: true, force: true });
});

function makeMockCtx(): ExtensionCommandContext {
  return { ui: { notify: vi.fn() } } as unknown as ExtensionCommandContext;
}

function makeMockPi(): ExtensionAPI {
  return { sendUserMessage: vi.fn() } as unknown as ExtensionAPI;
}

const CODEMAP: CodeMap = {
  projectId: "abc",
  projectName: "test",
  generatedAt: "2026-01-01T00:00:00Z",
  contentHash: "hash",
  directoryTree: [{ name: "src", type: "dir" }],
  packages: [],
  frameworks: [],
  entryPoints: [],
  buildScripts: [],
  conventions: [],
  keyFiles: [],
};

describe("handleTourCommand", () => {
  it("lists topics when no args", async () => {
    const dir = join(tmpBase, "list");
    mkdirSync(join(dir, "src"), { recursive: true });

    const ctx = makeMockCtx();
    const pi = makeMockPi();
    const cached: CacheEntry<CodeMap> = { data: CODEMAP, contentHash: "hash", createdAt: "" };
    const state: CompassState = {
      project: { id: "abc", name: "test", root: dir, remote: "" },
      turnCount: 0,
      codemapInjected: false,
      cachedCodemap: cached,
      stale: false,
    };
    const ref: StateRef = { get: () => state, set: vi.fn() };

    await handleTourCommand("", ctx, pi, ref);
    expect(vi.mocked(ctx.ui.notify)).toHaveBeenCalledWith(
      expect.stringContaining("src"),
      "info",
    );
  });

  it("generates tour for a topic", async () => {
    const dir = join(tmpBase, "topic");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "index.ts"), "");
    ensureStorageLayout("abc");

    const ctx = makeMockCtx();
    const pi = makeMockPi();
    const cached: CacheEntry<CodeMap> = { data: CODEMAP, contentHash: "hash", createdAt: "" };
    const state: CompassState = {
      project: { id: "abc", name: "test", root: dir, remote: "" },
      turnCount: 0,
      codemapInjected: false,
      cachedCodemap: cached,
      stale: false,
    };
    const ref: StateRef = { get: () => state, set: vi.fn() };

    await handleTourCommand("src", ctx, pi, ref);
    expect(vi.mocked(pi.sendUserMessage)).toHaveBeenCalled();
  });

  it("shows error when no project", async () => {
    const ctx = makeMockCtx();
    const pi = makeMockPi();
    const state: CompassState = { project: null, turnCount: 0, codemapInjected: false, cachedCodemap: null, stale: false };
    const ref: StateRef = { get: () => state, set: vi.fn() };

    await handleTourCommand("src", ctx, pi, ref);
    expect(vi.mocked(ctx.ui.notify)).toHaveBeenCalledWith(
      expect.stringContaining("No project"),
      "error",
    );
  });
});
