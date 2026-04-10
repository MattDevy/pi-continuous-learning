import { describe, it, expect, vi, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { handleOnboardCommand } from "./onboard-command.js";
import type { StateRef } from "./types.js";
import type { CompassState } from "./types.js";
import { ensureStorageLayout } from "./storage.js";

const tmpBase = mkdtempSync(join(tmpdir(), "compass-onboard-test-"));

afterAll(() => {
  rmSync(tmpBase, { recursive: true, force: true });
});

function makeMockCtx(): ExtensionCommandContext {
  return { ui: { notify: vi.fn() } } as unknown as ExtensionCommandContext;
}

function makeMockPi(): ExtensionAPI {
  return { sendUserMessage: vi.fn() } as unknown as ExtensionAPI;
}

function makeState(root: string): CompassState {
  return {
    project: { id: "test-id", name: "test", root, remote: "" },
    turnCount: 0,
    codemapInjected: false,
    cachedCodemap: null,
    stale: false,
  };
}

describe("handleOnboardCommand", () => {
  it("shows error when no project detected", async () => {
    const ctx = makeMockCtx();
    const pi = makeMockPi();
    const ref: StateRef = {
      get: () => ({ project: null, turnCount: 0, codemapInjected: false, cachedCodemap: null, stale: false }),
      set: vi.fn(),
    };
    await handleOnboardCommand("", ctx, pi, ref);
    expect(vi.mocked(ctx.ui.notify)).toHaveBeenCalledWith(
      expect.stringContaining("No project"),
      "error",
    );
  });

  it("generates codemap and sends message", async () => {
    const dir = join(tmpBase, "gen");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "test" }));
    ensureStorageLayout("test-id");

    const ctx = makeMockCtx();
    const pi = makeMockPi();
    const state = makeState(dir);
    const ref: StateRef = { get: () => state, set: vi.fn() };

    await handleOnboardCommand("", ctx, pi, ref);
    expect(vi.mocked(pi.sendUserMessage)).toHaveBeenCalledWith(
      expect.stringContaining("codebase map"),
      { deliverAs: "followUp" },
    );
  });
});
