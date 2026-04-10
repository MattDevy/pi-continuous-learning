import { describe, it, expect, vi, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerOnboardTools } from "./onboard-tools.js";
import type { StateRef } from "./types.js";
import type { CompassState, CodeMap, CacheEntry } from "./types.js";
import { ensureStorageLayout } from "./storage.js";

const tmpBase = mkdtempSync(join(tmpdir(), "compass-tools-test-"));

afterAll(() => {
  rmSync(tmpBase, { recursive: true, force: true });
});

type ToolDef = {
  name: string;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: unknown,
  ) => Promise<{ content: { type: string; text: string }[]; details?: unknown }>;
};

function registerAndCapture(stateRef: StateRef): Map<string, ToolDef> {
  const tools = new Map<string, ToolDef>();
  const mockPi = {
    registerTool: vi.fn((def: ToolDef) => { tools.set(def.name, def); }),
  } as unknown as ExtensionAPI;
  registerOnboardTools(mockPi, stateRef);
  return tools;
}

describe("registerOnboardTools", () => {
  it("registers 2 tools", () => {
    const mockPi = { registerTool: vi.fn() } as unknown as ExtensionAPI;
    const ref: StateRef = {
      get: () => ({ project: null, turnCount: 0, codemapInjected: false, cachedCodemap: null, stale: false }),
      set: vi.fn(),
    };
    registerOnboardTools(mockPi, ref);
    expect(vi.mocked(mockPi.registerTool)).toHaveBeenCalledTimes(2);
  });
});

describe("codebase_map tool", () => {
  it("generates codemap for project", async () => {
    const dir = join(tmpBase, "map-tool");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "test" }));
    ensureStorageLayout("map-id");

    const state: CompassState = {
      project: { id: "map-id", name: "test", root: dir, remote: "" },
      turnCount: 0,
      codemapInjected: false,
      cachedCodemap: null,
      stale: false,
    };
    const ref: StateRef = { get: () => state, set: vi.fn() };
    const tools = registerAndCapture(ref);
    const tool = tools.get("codebase_map")!;

    const result = await tool.execute("c1", {}, undefined, null, null);
    expect(result.content[0]?.text).toContain("Codebase Map");
  });

  it("throws when no project", async () => {
    const state: CompassState = { project: null, turnCount: 0, codemapInjected: false, cachedCodemap: null, stale: false };
    const ref: StateRef = { get: () => state, set: vi.fn() };
    const tools = registerAndCapture(ref);
    const tool = tools.get("codebase_map")!;

    await expect(tool.execute("c1", {}, undefined, null, null)).rejects.toThrow("No project");
  });
});

describe("code_tour tool", () => {
  it("lists topics when no topic param", async () => {
    const dir = join(tmpBase, "tour-tool-list");
    mkdirSync(join(dir, "src"), { recursive: true });
    ensureStorageLayout("tour-id");

    const codemap: CodeMap = {
      projectId: "tour-id",
      projectName: "test",
      generatedAt: "",
      contentHash: "hash",
      directoryTree: [{ name: "src", type: "dir" }],
      packages: [],
      frameworks: [],
      entryPoints: [],
      buildScripts: [],
      conventions: [],
      keyFiles: [],
    };
    const cached: CacheEntry<CodeMap> = { data: codemap, contentHash: "hash", createdAt: "" };
    const state: CompassState = {
      project: { id: "tour-id", name: "test", root: dir, remote: "" },
      turnCount: 0,
      codemapInjected: false,
      cachedCodemap: cached,
      stale: false,
    };
    const ref: StateRef = { get: () => state, set: vi.fn() };
    const tools = registerAndCapture(ref);
    const tool = tools.get("code_tour")!;

    const result = await tool.execute("c1", {}, undefined, null, null);
    expect(result.content[0]?.text).toContain("src");
  });
});
