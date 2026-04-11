import { describe, it, expect } from "vitest";
import {
  findBlockedTasks,
  isTaskReady,
  getBlockingTasks,
  detectCycles,
  topologicalSort,
} from "./dependency-graph.js";
import type { Task } from "./types.js";

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: overrides.id,
    description: "",
    status: "pending",
    acceptance_criteria: [],
    file_targets: [],
    dependencies: [],
    started_at: null,
    completed_at: null,
    session_id: null,
    notes: null,
    ...overrides,
  };
}

describe("findBlockedTasks", () => {
  it("returns empty for tasks with no dependencies", () => {
    const tasks = [makeTask({ id: "1.1" }), makeTask({ id: "1.2" })];
    expect(findBlockedTasks(tasks)).toEqual([]);
  });

  it("returns task IDs with incomplete dependencies", () => {
    const tasks = [
      makeTask({ id: "1.1", status: "pending" }),
      makeTask({ id: "1.2", dependencies: ["1.1"] }),
    ];
    expect(findBlockedTasks(tasks)).toEqual(["1.2"]);
  });

  it("excludes tasks whose dependencies are completed", () => {
    const tasks = [
      makeTask({ id: "1.1", status: "completed" }),
      makeTask({ id: "1.2", dependencies: ["1.1"] }),
    ];
    expect(findBlockedTasks(tasks)).toEqual([]);
  });

  it("treats skipped tasks as resolved dependencies", () => {
    const tasks = [
      makeTask({ id: "1.1", status: "skipped" }),
      makeTask({ id: "1.2", dependencies: ["1.1"] }),
    ];
    expect(findBlockedTasks(tasks)).toEqual([]);
  });

  it("handles diamond dependencies", () => {
    const tasks = [
      makeTask({ id: "1.1", status: "completed" }),
      makeTask({ id: "1.2", dependencies: ["1.1"], status: "completed" }),
      makeTask({ id: "1.3", dependencies: ["1.1"], status: "pending" }),
      makeTask({ id: "1.4", dependencies: ["1.2", "1.3"] }),
    ];
    expect(findBlockedTasks(tasks)).toEqual(["1.4"]);
  });

  it("does not include already completed tasks", () => {
    const tasks = [
      makeTask({ id: "1.1", status: "pending" }),
      makeTask({ id: "1.2", dependencies: ["1.1"], status: "completed" }),
    ];
    expect(findBlockedTasks(tasks)).toEqual([]);
  });
});

describe("isTaskReady", () => {
  it("returns true for task with no dependencies", () => {
    const tasks = [makeTask({ id: "1.1" })];
    expect(isTaskReady(tasks, "1.1")).toBe(true);
  });

  it("returns false for task with incomplete dependency", () => {
    const tasks = [
      makeTask({ id: "1.1" }),
      makeTask({ id: "1.2", dependencies: ["1.1"] }),
    ];
    expect(isTaskReady(tasks, "1.2")).toBe(false);
  });

  it("returns true when all dependencies are completed", () => {
    const tasks = [
      makeTask({ id: "1.1", status: "completed" }),
      makeTask({ id: "1.2", dependencies: ["1.1"] }),
    ];
    expect(isTaskReady(tasks, "1.2")).toBe(true);
  });

  it("returns false for completed task", () => {
    const tasks = [makeTask({ id: "1.1", status: "completed" })];
    expect(isTaskReady(tasks, "1.1")).toBe(false);
  });

  it("returns false for nonexistent task", () => {
    expect(isTaskReady([], "nope")).toBe(false);
  });
});

describe("getBlockingTasks", () => {
  it("returns empty for task with no dependencies", () => {
    const tasks = [makeTask({ id: "1.1" })];
    expect(getBlockingTasks(tasks, "1.1")).toEqual([]);
  });

  it("returns incomplete dependency IDs", () => {
    const tasks = [
      makeTask({ id: "1.1", status: "pending" }),
      makeTask({ id: "1.2", status: "completed" }),
      makeTask({ id: "1.3", dependencies: ["1.1", "1.2"] }),
    ];
    expect(getBlockingTasks(tasks, "1.3")).toEqual(["1.1"]);
  });

  it("returns empty for nonexistent task", () => {
    expect(getBlockingTasks([], "nope")).toEqual([]);
  });
});

describe("detectCycles", () => {
  it("returns empty for acyclic graph", () => {
    const tasks = [
      makeTask({ id: "1.1" }),
      makeTask({ id: "1.2", dependencies: ["1.1"] }),
      makeTask({ id: "1.3", dependencies: ["1.2"] }),
    ];
    expect(detectCycles(tasks)).toEqual([]);
  });

  it("detects simple cycle", () => {
    const tasks = [
      makeTask({ id: "1.1", dependencies: ["1.2"] }),
      makeTask({ id: "1.2", dependencies: ["1.1"] }),
    ];
    const cycles = detectCycles(tasks);
    expect(cycles.length).toBeGreaterThan(0);
  });

  it("detects self-loop", () => {
    const tasks = [makeTask({ id: "1.1", dependencies: ["1.1"] })];
    const cycles = detectCycles(tasks);
    expect(cycles.length).toBeGreaterThan(0);
  });

  it("returns empty for isolated nodes", () => {
    const tasks = [makeTask({ id: "1.1" }), makeTask({ id: "1.2" })];
    expect(detectCycles(tasks)).toEqual([]);
  });

  it("ignores dependencies referencing nonexistent tasks", () => {
    const tasks = [makeTask({ id: "1.1", dependencies: ["missing"] })];
    expect(detectCycles(tasks)).toEqual([]);
  });
});

describe("topologicalSort", () => {
  it("returns IDs in dependency order", () => {
    const tasks = [
      makeTask({ id: "1.3", dependencies: ["1.2"] }),
      makeTask({ id: "1.1" }),
      makeTask({ id: "1.2", dependencies: ["1.1"] }),
    ];
    const sorted = topologicalSort(tasks);
    expect(sorted.indexOf("1.1")).toBeLessThan(sorted.indexOf("1.2"));
    expect(sorted.indexOf("1.2")).toBeLessThan(sorted.indexOf("1.3"));
  });

  it("returns all task IDs for independent tasks", () => {
    const tasks = [makeTask({ id: "a" }), makeTask({ id: "b" }), makeTask({ id: "c" })];
    const sorted = topologicalSort(tasks);
    expect(sorted).toHaveLength(3);
    expect(new Set(sorted)).toEqual(new Set(["a", "b", "c"]));
  });

  it("handles empty input", () => {
    expect(topologicalSort([])).toEqual([]);
  });

  it("omits nodes involved in cycles from result", () => {
    const tasks = [
      makeTask({ id: "1.1", dependencies: ["1.2"] }),
      makeTask({ id: "1.2", dependencies: ["1.1"] }),
      makeTask({ id: "1.3" }),
    ];
    const sorted = topologicalSort(tasks);
    expect(sorted).toContain("1.3");
    expect(sorted).toHaveLength(1);
  });
});
