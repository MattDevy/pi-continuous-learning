/**
 * Tests for US-019: Analyzer Timeout and Process Management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { type ChildProcess } from "node:child_process";
import { Readable } from "node:stream";

// ---------------------------------------------------------------------------
// Mocks - must be declared before dynamic imports
// ---------------------------------------------------------------------------

vi.mock("./observer-guard.js", () => ({
  setAnalyzerRunning: vi.fn(),
  shouldSkipObservation: vi.fn(() => false),
}));

vi.mock("./analyzer-spawn.js", () => ({
  spawnAnalyzer: vi.fn(),
}));

vi.mock("./analyzer-stream.js", () => ({
  parseAnalyzerStream: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal fake ChildProcess for testing. */
function makeFakeProcess(options?: { stdout?: Readable }): ChildProcess {
  const emitter = new EventEmitter();
  const stdout = options?.stdout ?? Readable.from([]);

  const fake = Object.assign(emitter, {
    kill: vi.fn((signal?: string) => {
      // Simulate the process closing after being killed
      emitter.emit("close", null, signal ?? "SIGTERM");
      return true;
    }),
    stdout,
    stderr: Readable.from([]),
    stdin: null,
    pid: 12345,
    killed: false,
    exitCode: null,
    signalCode: null,
    spawnfile: "pi",
    spawnargs: [],
    connected: false,
    send: vi.fn(),
    disconnect: vi.fn(),
    unref: vi.fn(),
    ref: vi.fn(),
    stdio: [null, stdout, null, null, null] as ChildProcess["stdio"],
  });

  return fake as unknown as ChildProcess;
}

/** Builds a handle as returned by spawnAnalyzer. */
function makeHandle(process: ChildProcess) {
  const completion = new Promise<number | null>((resolve) => {
    process.on("close", (code) => resolve(code));
  });
  return { process, completion };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let spawnAnalyzerMock: ReturnType<typeof vi.fn>;
let parseStreamMock: ReturnType<typeof vi.fn>;
let setAnalyzerRunningMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.useFakeTimers();

  const spawnModule = await import("./analyzer-spawn.js");
  const streamModule = await import("./analyzer-stream.js");
  const guardModule = await import("./observer-guard.js");

  spawnAnalyzerMock = vi.mocked(spawnModule.spawnAnalyzer);
  parseStreamMock = vi.mocked(streamModule.parseAnalyzerStream);
  setAnalyzerRunningMock = vi.mocked(guardModule.setAnalyzerRunning);

  // Default: parse resolves immediately with a success result
  parseStreamMock.mockResolvedValue({
    success: true,
    filesWritten: [],
    errors: [],
  });

  // Reset module state between tests
  const runner = await import("./analyzer-runner.js");
  runner.resetAnalyzerState();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runAnalysis - re-entrancy guard", () => {
  it("returns skipped=in_progress when analysis already running", async () => {
    const runner = await import("./analyzer-runner.js");

    const proc = makeFakeProcess();
    const handle = makeHandle(proc);

    spawnAnalyzerMock.mockReturnValue(handle);

    // Stream resolves only when process emits close (i.e. when proc.kill is called)
    parseStreamMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          proc.on("close", () =>
            resolve({ success: false, filesWritten: [], errors: [] })
          );
        })
    );

    // Start first run (do not await - it's blocked waiting for stream)
    const first = runner.runAnalysis({
      systemPromptFile: "/tmp/sys.md",
      userPrompt: "analyze",
      cwd: "/tmp",
    });

    // Second call should be rejected immediately since first is in_progress
    const second = await runner.runAnalysis({
      systemPromptFile: "/tmp/sys.md",
      userPrompt: "analyze",
      cwd: "/tmp",
    });

    expect(second.skipped).toBe(true);
    expect(second.skipReason).toBe("in_progress");

    // Cleanup: kill process to unblock the first run
    proc.kill("SIGTERM");
    await first;
  });

  it("allows a new run after previous completes", async () => {
    const runner = await import("./analyzer-runner.js");

    const proc1 = makeFakeProcess();
    const proc2 = makeFakeProcess();

    spawnAnalyzerMock
      .mockReturnValueOnce(makeHandle(proc1))
      .mockReturnValueOnce(makeHandle(proc2));

    // First run
    const first = await runner.runAnalysis({
      systemPromptFile: "/tmp/sys.md",
      userPrompt: "analyze",
      cwd: "/tmp",
    });
    expect(first.skipped).toBe(false);

    // Advance past cooldown so second run is not skipped by cooldown
    vi.advanceTimersByTime(61_000);

    // Second run - should proceed
    const second = await runner.runAnalysis({
      systemPromptFile: "/tmp/sys.md",
      userPrompt: "analyze",
      cwd: "/tmp",
    });
    expect(second.skipped).toBe(false);
  });
});

describe("runAnalysis - cooldown", () => {
  it("skips run when within 60-second cooldown window", async () => {
    const runner = await import("./analyzer-runner.js");

    const proc = makeFakeProcess();
    spawnAnalyzerMock.mockReturnValue(makeHandle(proc));

    // First run completes
    await runner.runAnalysis({
      systemPromptFile: "/tmp/sys.md",
      userPrompt: "analyze",
      cwd: "/tmp",
    });

    // Advance only 30 seconds (within cooldown)
    vi.advanceTimersByTime(30_000);

    const second = await runner.runAnalysis({
      systemPromptFile: "/tmp/sys.md",
      userPrompt: "analyze",
      cwd: "/tmp",
    });

    expect(second.skipped).toBe(true);
    expect(second.skipReason).toBe("cooldown");
  });

  it("allows run after cooldown expires", async () => {
    const runner = await import("./analyzer-runner.js");

    const proc1 = makeFakeProcess();
    const proc2 = makeFakeProcess();

    spawnAnalyzerMock
      .mockReturnValueOnce(makeHandle(proc1))
      .mockReturnValueOnce(makeHandle(proc2));

    await runner.runAnalysis({
      systemPromptFile: "/tmp/sys.md",
      userPrompt: "analyze",
      cwd: "/tmp",
    });

    // Advance past cooldown
    vi.advanceTimersByTime(61_000);

    const second = await runner.runAnalysis({
      systemPromptFile: "/tmp/sys.md",
      userPrompt: "analyze",
      cwd: "/tmp",
    });

    expect(second.skipped).toBe(false);
  });
});

describe("runAnalysis - timeout", () => {
  it("kills the subprocess after timeoutSeconds and resolves", async () => {
    const runner = await import("./analyzer-runner.js");

    const proc = makeFakeProcess();
    spawnAnalyzerMock.mockReturnValue(makeHandle(proc));

    // parseAnalyzerStream never resolves until the stream ends (process killed)
    parseStreamMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          // Resolve when process receives kill signal
          proc.on("close", () =>
            resolve({ success: false, filesWritten: [], errors: [] })
          );
        })
    );

    const runPromise = runner.runAnalysis({
      systemPromptFile: "/tmp/sys.md",
      userPrompt: "analyze",
      cwd: "/tmp",
      timeoutSeconds: 5,
    });

    // Advance to just before timeout - process should still be alive
    vi.advanceTimersByTime(4_999);
    expect(proc.kill).not.toHaveBeenCalled();

    // Cross the timeout
    vi.advanceTimersByTime(2);
    expect(proc.kill).toHaveBeenCalledWith("SIGTERM");

    const result = await runPromise;
    expect(result.skipped).toBe(false);
    expect(result.result?.success).toBe(false);

    // After timeout, running flag should be reset
    expect(runner.isAnalysisRunning()).toBe(false);
  });
});

describe("shutdownAnalyzer", () => {
  it("kills the running subprocess immediately", async () => {
    const runner = await import("./analyzer-runner.js");

    const proc = makeFakeProcess();
    spawnAnalyzerMock.mockReturnValue(makeHandle(proc));

    parseStreamMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          proc.on("close", () =>
            resolve({ success: false, filesWritten: [], errors: [] })
          );
        })
    );

    const runPromise = runner.runAnalysis({
      systemPromptFile: "/tmp/sys.md",
      userPrompt: "analyze",
      cwd: "/tmp",
    });

    // Shut down while running
    runner.shutdownAnalyzer();

    expect(proc.kill).toHaveBeenCalledWith("SIGTERM");

    await runPromise;
    expect(runner.isAnalysisRunning()).toBe(false);
  });

  it("does nothing when no analysis is running", async () => {
    const runner = await import("./analyzer-runner.js");
    // Should not throw when no process is active
    expect(() => runner.shutdownAnalyzer()).not.toThrow();
  });
});

describe("setAnalyzerRunning integration", () => {
  it("sets running flag on start and clears on completion", async () => {
    const runner = await import("./analyzer-runner.js");

    const proc = makeFakeProcess();
    spawnAnalyzerMock.mockReturnValue(makeHandle(proc));

    await runner.runAnalysis({
      systemPromptFile: "/tmp/sys.md",
      userPrompt: "analyze",
      cwd: "/tmp",
    });

    // setAnalyzerRunning called with true on start, false on completion
    expect(setAnalyzerRunningMock).toHaveBeenCalledWith(true);
    expect(setAnalyzerRunningMock).toHaveBeenCalledWith(false);
  });
});

describe("isAnalysisRunning and getLastRunTime", () => {
  it("is false initially", async () => {
    const runner = await import("./analyzer-runner.js");
    expect(runner.isAnalysisRunning()).toBe(false);
  });

  it("lastRunTime is null before any run", async () => {
    const runner = await import("./analyzer-runner.js");
    expect(runner.getLastRunTime()).toBeNull();
  });

  it("lastRunTime is set after a completed run", async () => {
    const runner = await import("./analyzer-runner.js");

    const proc = makeFakeProcess();
    spawnAnalyzerMock.mockReturnValue(makeHandle(proc));

    const before = Date.now();
    await runner.runAnalysis({
      systemPromptFile: "/tmp/sys.md",
      userPrompt: "analyze",
      cwd: "/tmp",
    });

    const lastRun = runner.getLastRunTime();
    expect(lastRun).not.toBeNull();
    expect(lastRun!).toBeGreaterThanOrEqual(before);
  });
});
