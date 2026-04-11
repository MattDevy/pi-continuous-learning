import { describe, it, expect, vi } from "vitest";
import { runGate } from "./verification.js";
import type { VerificationGate } from "./types.js";

function makeGate(overrides?: Partial<VerificationGate>): VerificationGate {
  return {
    type: "tests_pass",
    command: null,
    description: "Tests pass",
    passed: false,
    last_checked_at: null,
    error_message: null,
    ...overrides,
  };
}

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "node:child_process";
const mockExecSync = vi.mocked(execSync);

describe("runGate", () => {
  it("returns not passed for user_approval gate", () => {
    const result = runGate(makeGate({ type: "user_approval" }), "/tmp");
    expect(result.passed).toBe(false);
    expect(result.output).toContain("user approval");
  });

  it("runs npm test for tests_pass gate", () => {
    mockExecSync.mockReturnValue("all tests passed");
    const result = runGate(makeGate({ type: "tests_pass" }), "/project");
    expect(result.passed).toBe(true);
    expect(mockExecSync).toHaveBeenCalledWith(
      "npm test",
      expect.objectContaining({ cwd: "/project" }),
    );
  });

  it("runs tsc for typecheck_clean gate", () => {
    mockExecSync.mockReturnValue("");
    const result = runGate(makeGate({ type: "typecheck_clean" }), "/project");
    expect(result.passed).toBe(true);
    expect(mockExecSync).toHaveBeenCalledWith(
      "npx tsc --noEmit",
      expect.objectContaining({ cwd: "/project" }),
    );
  });

  it("runs custom command", () => {
    mockExecSync.mockReturnValue("ok");
    const result = runGate(
      makeGate({ type: "custom_command", command: "make lint" }),
      "/project",
    );
    expect(result.passed).toBe(true);
    expect(mockExecSync).toHaveBeenCalledWith(
      "make lint",
      expect.objectContaining({ cwd: "/project" }),
    );
  });

  it("returns not passed on command failure", () => {
    mockExecSync.mockImplementation(() => {
      const err = new Error("Command failed") as Error & { stderr: string };
      err.stderr = "3 tests failed";
      throw err;
    });
    const result = runGate(makeGate({ type: "tests_pass" }), "/project");
    expect(result.passed).toBe(false);
    expect(result.output).toContain("3 tests failed");
  });

  it("returns not passed for custom_command with null command", () => {
    const result = runGate(
      makeGate({ type: "custom_command", command: null }),
      "/project",
    );
    expect(result.passed).toBe(false);
  });
});
