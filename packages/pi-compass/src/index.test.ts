import { describe, it, expect, vi } from "vitest";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import extension from "./index.js";

function makeMockPi(): ExtensionAPI {
  return {
    on: vi.fn(),
    registerCommand: vi.fn(),
    registerTool: vi.fn(),
    exec: vi.fn(),
  } as unknown as ExtensionAPI;
}

describe("extension entry point", () => {
  it("registers 3 event handlers", () => {
    const pi = makeMockPi();
    extension(pi);
    expect(vi.mocked(pi.on)).toHaveBeenCalledTimes(3);
  });

  it("registers session_start handler", () => {
    const pi = makeMockPi();
    extension(pi);
    const events = vi.mocked(pi.on).mock.calls.map(([e]) => e);
    expect(events).toContain("session_start");
  });

  it("registers before_agent_start handler", () => {
    const pi = makeMockPi();
    extension(pi);
    const events = vi.mocked(pi.on).mock.calls.map(([e]) => e);
    expect(events).toContain("before_agent_start");
  });

  it("registers turn_end handler", () => {
    const pi = makeMockPi();
    extension(pi);
    const events = vi.mocked(pi.on).mock.calls.map(([e]) => e);
    expect(events).toContain("turn_end");
  });

  it("registers 2 commands", () => {
    const pi = makeMockPi();
    extension(pi);
    expect(vi.mocked(pi.registerCommand)).toHaveBeenCalledTimes(2);
  });

  it("registers onboard command", () => {
    const pi = makeMockPi();
    extension(pi);
    const commands = vi.mocked(pi.registerCommand).mock.calls.map(([name]) => name);
    expect(commands).toContain("onboard");
  });

  it("registers tour command", () => {
    const pi = makeMockPi();
    extension(pi);
    const commands = vi.mocked(pi.registerCommand).mock.calls.map(([name]) => name);
    expect(commands).toContain("tour");
  });
});
