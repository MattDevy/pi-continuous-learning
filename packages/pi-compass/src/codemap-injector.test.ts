import { describe, it, expect } from "vitest";
import { buildCodemapInjection, handleBeforeAgentStart } from "./codemap-injector.js";
import type { CodeMap, CompassState, CacheEntry } from "./types.js";

const MINIMAL_MAP: CodeMap = {
  projectId: "abc",
  projectName: "test",
  generatedAt: "2026-01-01T00:00:00Z",
  contentHash: "hash123",
  directoryTree: [{ name: "src", type: "dir" }],
  packages: [],
  frameworks: [],
  entryPoints: [],
  buildScripts: [],
  conventions: [],
  keyFiles: [],
};

const CACHED: CacheEntry<CodeMap> = {
  data: MINIMAL_MAP,
  contentHash: "hash123",
  createdAt: "2026-01-01T00:00:00Z",
};

function makeState(overrides: Partial<CompassState> = {}): CompassState {
  return {
    project: { id: "abc", name: "test", root: "/tmp", remote: "" },
    turnCount: 0,
    codemapInjected: false,
    cachedCodemap: CACHED,
    stale: false,
    ...overrides,
  };
}

describe("buildCodemapInjection", () => {
  it("returns markdown injection block", () => {
    const result = buildCodemapInjection(MINIMAL_MAP, false, 10000);
    expect(result).toContain("Codebase Map: test");
  });

  it("includes stale note when stale", () => {
    const result = buildCodemapInjection(MINIMAL_MAP, true, 10000);
    expect(result).toContain("outdated");
    expect(result).toContain("/onboard");
  });

  it("does not include stale note when fresh", () => {
    const result = buildCodemapInjection(MINIMAL_MAP, false, 10000);
    expect(result).not.toContain("outdated");
  });
});

describe("handleBeforeAgentStart", () => {
  it("injects codemap on first turn", () => {
    const event = { type: "before_agent_start" as const, prompt: "", systemPrompt: "base" };
    const state = makeState({ codemapInjected: false });
    const result = handleBeforeAgentStart(event, state, 10000);
    expect(result).toBeDefined();
    expect(result!.systemPrompt).toContain("base");
    expect(result!.systemPrompt).toContain("Codebase Map");
  });

  it("returns undefined when already injected", () => {
    const event = { type: "before_agent_start" as const, prompt: "", systemPrompt: "base" };
    const state = makeState({ codemapInjected: true });
    expect(handleBeforeAgentStart(event, state, 10000)).toBeUndefined();
  });

  it("returns undefined when no cached codemap", () => {
    const event = { type: "before_agent_start" as const, prompt: "", systemPrompt: "base" };
    const state = makeState({ cachedCodemap: null });
    expect(handleBeforeAgentStart(event, state, 10000)).toBeUndefined();
  });
});
