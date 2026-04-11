import { describe, it, expect, vi } from "vitest";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import registerExtension from "./index.js";
import { registerBlueprintTools } from "./blueprint-tools.js";

vi.mock("./storage.js", () => ({
  ensureBaseDir: vi.fn(),
  loadIndex: vi.fn().mockReturnValue(null),
  loadBlueprint: vi.fn().mockReturnValue(null),
  saveBlueprint: vi.fn(),
}));

vi.mock("./blueprint-tools.js", () => ({
  registerBlueprintTools: vi.fn(),
}));

function createMockPi() {
  const hooks = new Map<string, ((...args: unknown[]) => unknown)[]>();
  const commands = new Map<string, unknown>();
  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      if (!hooks.has(event)) hooks.set(event, []);
      hooks.get(event)!.push(handler);
    }),
    registerCommand: vi.fn((name: string, def: unknown) => {
      commands.set(name, def);
    }),
    registerTool: vi.fn(),
    sendUserMessage: vi.fn(),
    hooks,
    commands,
  };
}

describe("index", () => {
  it("registers 4 hooks", () => {
    const pi = createMockPi();
    registerExtension(pi as unknown as ExtensionAPI);
    expect(pi.on).toHaveBeenCalledWith("session_start", expect.any(Function));
    expect(pi.on).toHaveBeenCalledWith("session_shutdown", expect.any(Function));
    expect(pi.on).toHaveBeenCalledWith("before_agent_start", expect.any(Function));
    expect(pi.on).toHaveBeenCalledWith("turn_end", expect.any(Function));
  });

  it("registers 4 commands", () => {
    const pi = createMockPi();
    registerExtension(pi as unknown as ExtensionAPI);
    expect(pi.registerCommand).toHaveBeenCalledTimes(4);
    expect(pi.commands.has("blueprint")).toBe(true);
    expect(pi.commands.has("plan-status")).toBe(true);
    expect(pi.commands.has("plan-verify")).toBe(true);
    expect(pi.commands.has("plan-next")).toBe(true);
  });

  it("session_start loads blueprint and registers tools", () => {
    const pi = createMockPi();
    registerExtension(pi as unknown as ExtensionAPI);

    const sessionStartHandler = pi.hooks.get("session_start")![0]!;
    sessionStartHandler({}, { ui: { notify: vi.fn() } });

    expect(registerBlueprintTools).toHaveBeenCalled();
  });

  it("before_agent_start returns undefined when no blueprint", () => {
    const pi = createMockPi();
    registerExtension(pi as unknown as ExtensionAPI);

    const handler = pi.hooks.get("before_agent_start")![0]!;
    const result = handler({ systemPrompt: "base" }, {});
    expect(result).toBeUndefined();
  });
});
