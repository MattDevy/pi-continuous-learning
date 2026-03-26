import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

// Import after mock registration
const { spawn } = await import("node:child_process");
const { spawnAnalyzer, buildAnalyzerArgs } = await import("./analyzer-spawn.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal fake ChildProcess for testing. */
function makeFakeProcess(): ChildProcess {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    stdin: null,
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    pid: 12345,
    killed: false,
    exitCode: null,
    signalCode: null,
  }) as unknown as ChildProcess;
}

// ---------------------------------------------------------------------------
// buildAnalyzerArgs tests
// ---------------------------------------------------------------------------

describe("buildAnalyzerArgs", () => {
  it("includes --mode json as first two args", () => {
    const args = buildAnalyzerArgs("/tmp/sys.md", "analyze this", "claude-haiku-4-5");
    expect(args[0]).toBe("--mode");
    expect(args[1]).toBe("json");
  });

  it("includes -p flag", () => {
    const args = buildAnalyzerArgs("/tmp/sys.md", "analyze this", "claude-haiku-4-5");
    expect(args).toContain("-p");
  });

  it("includes --no-session flag", () => {
    const args = buildAnalyzerArgs("/tmp/sys.md", "analyze this", "claude-haiku-4-5");
    expect(args).toContain("--no-session");
  });

  it("includes --model with specified model", () => {
    const args = buildAnalyzerArgs("/tmp/sys.md", "analyze this", "claude-haiku-4-5");
    const modelIdx = args.indexOf("--model");
    expect(modelIdx).toBeGreaterThan(-1);
    expect(args[modelIdx + 1]).toBe("claude-haiku-4-5");
  });

  it("includes --tools read,write", () => {
    const args = buildAnalyzerArgs("/tmp/sys.md", "analyze this", "claude-haiku-4-5");
    const toolsIdx = args.indexOf("--tools");
    expect(toolsIdx).toBeGreaterThan(-1);
    expect(args[toolsIdx + 1]).toBe("read,write");
  });

  it("includes --no-extensions flag", () => {
    const args = buildAnalyzerArgs("/tmp/sys.md", "analyze this", "claude-haiku-4-5");
    expect(args).toContain("--no-extensions");
  });

  it("includes --no-skills flag", () => {
    const args = buildAnalyzerArgs("/tmp/sys.md", "analyze this", "claude-haiku-4-5");
    expect(args).toContain("--no-skills");
  });

  it("includes --no-prompt-templates flag", () => {
    const args = buildAnalyzerArgs("/tmp/sys.md", "analyze this", "claude-haiku-4-5");
    expect(args).toContain("--no-prompt-templates");
  });

  it("includes --no-themes flag", () => {
    const args = buildAnalyzerArgs("/tmp/sys.md", "analyze this", "claude-haiku-4-5");
    expect(args).toContain("--no-themes");
  });

  it("includes --append-system-prompt with the file path", () => {
    const args = buildAnalyzerArgs("/tmp/sys.md", "analyze this", "claude-haiku-4-5");
    const aspIdx = args.indexOf("--append-system-prompt");
    expect(aspIdx).toBeGreaterThan(-1);
    expect(args[aspIdx + 1]).toBe("/tmp/sys.md");
  });

  it("user prompt is the final positional argument", () => {
    const prompt = "analyze this session";
    const args = buildAnalyzerArgs("/tmp/sys.md", prompt, "claude-haiku-4-5");
    expect(args[args.length - 1]).toBe(prompt);
  });

  it("user prompt comes after --append-system-prompt <file>", () => {
    const args = buildAnalyzerArgs("/tmp/sys.md", "my prompt", "claude-haiku-4-5");
    const aspIdx = args.indexOf("--append-system-prompt");
    // system prompt file is at aspIdx+1, user prompt must be after that
    expect(args.indexOf("my prompt")).toBeGreaterThan(aspIdx + 1);
  });

  it("uses the provided model when different from default", () => {
    const args = buildAnalyzerArgs("/tmp/sys.md", "analyze", "claude-opus-4-5");
    const modelIdx = args.indexOf("--model");
    expect(args[modelIdx + 1]).toBe("claude-opus-4-5");
  });
});

// ---------------------------------------------------------------------------
// spawnAnalyzer tests
// ---------------------------------------------------------------------------

describe("spawnAnalyzer", () => {
  let fakeProcess: ChildProcess;

  beforeEach(() => {
    fakeProcess = makeFakeProcess();
    vi.mocked(spawn).mockReturnValue(fakeProcess as ReturnType<typeof spawn>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls spawn with 'pi' as the executable", () => {
    spawnAnalyzer("/tmp/sys.md", "analyze this", "/project");
    expect(vi.mocked(spawn)).toHaveBeenCalledWith(
      "pi",
      expect.any(Array),
      expect.any(Object)
    );
  });

  it("passes the correct args array to spawn", () => {
    spawnAnalyzer("/tmp/sys.md", "my prompt", "/project");
    const [, args] = vi.mocked(spawn).mock.calls[0]!;
    expect(args).toContain("--mode");
    expect(args).toContain("json");
    expect(args).toContain("--append-system-prompt");
    expect(args).toContain("/tmp/sys.md");
    expect(args[args.length - 1]).toBe("my prompt");
  });

  it("spawns with stdin ignored and stdout/stderr piped", () => {
    spawnAnalyzer("/tmp/sys.md", "analyze this", "/project");
    const [, , options] = vi.mocked(spawn).mock.calls[0]!;
    expect(options?.stdio).toEqual(["ignore", "pipe", "pipe"]);
  });

  it("uses the cwd option from the parameter", () => {
    spawnAnalyzer("/tmp/sys.md", "analyze this", "/my/project");
    const [, , options] = vi.mocked(spawn).mock.calls[0]!;
    expect(options?.cwd).toBe("/my/project");
  });

  it("returns a handle with the child process", () => {
    const handle = spawnAnalyzer("/tmp/sys.md", "analyze this", "/project");
    expect(handle.process).toBe(fakeProcess);
  });

  it("returns a handle with a completion promise", () => {
    const handle = spawnAnalyzer("/tmp/sys.md", "analyze this", "/project");
    expect(handle.completion).toBeInstanceOf(Promise);
  });

  it("completion promise resolves with exit code on close", async () => {
    const handle = spawnAnalyzer("/tmp/sys.md", "analyze this", "/project");
    fakeProcess.emit("close", 0);
    const code = await handle.completion;
    expect(code).toBe(0);
  });

  it("completion promise resolves with null when process is killed", async () => {
    const handle = spawnAnalyzer("/tmp/sys.md", "analyze this", "/project");
    fakeProcess.emit("close", null);
    const code = await handle.completion;
    expect(code).toBeNull();
  });

  it("defaults to claude-haiku-4-5 model when not specified", () => {
    spawnAnalyzer("/tmp/sys.md", "analyze this", "/project");
    const [, args] = vi.mocked(spawn).mock.calls[0]!;
    const modelIdx = (args as string[]).indexOf("--model");
    expect((args as string[])[modelIdx + 1]).toBe("claude-haiku-4-5");
  });

  it("uses the specified model when provided", () => {
    spawnAnalyzer("/tmp/sys.md", "analyze this", "/project", "claude-opus-4-5");
    const [, args] = vi.mocked(spawn).mock.calls[0]!;
    const modelIdx = (args as string[]).indexOf("--model");
    expect((args as string[])[modelIdx + 1]).toBe("claude-opus-4-5");
  });
});
