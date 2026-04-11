import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadIndex,
  saveIndex,
  loadBlueprint,
  saveBlueprint,
  appendHistory,
  loadSessions,
  saveSessions,
} from "./storage.js";
import type {
  Blueprint,
  BlueprintIndex,
  HistoryEntry,
  SessionsState,
} from "./types.js";

let baseDir: string;

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), "pi-blueprint-test-"));
});

function sampleBlueprint(): Blueprint {
  return {
    id: "bp-1",
    objective: "Test objective",
    project_id: "proj-1",
    status: "active",
    created_at: "2026-04-11T00:00:00.000Z",
    updated_at: "2026-04-11T00:00:00.000Z",
    phases: [
      {
        id: "1",
        title: "Phase 1",
        description: "",
        status: "active",
        tasks: [
          {
            id: "1.1",
            title: "Task one",
            description: "",
            status: "pending",
            acceptance_criteria: [],
            file_targets: [],
            dependencies: [],
            started_at: null,
            completed_at: null,
            session_id: null,
            notes: null,
          },
        ],
        verification_gates: [],
        started_at: null,
        completed_at: null,
      },
    ],
    active_phase_id: "1",
    active_task_id: "1.1",
  };
}

describe("index", () => {
  it("returns null when no index exists", () => {
    expect(loadIndex(baseDir)).toBeNull();
  });

  it("round-trips index", () => {
    const index: BlueprintIndex = {
      active_blueprint_id: "bp-1",
      blueprints: [
        {
          id: "bp-1",
          objective: "Test",
          status: "active",
          created_at: "2026-04-11T00:00:00.000Z",
          project_id: "proj-1",
        },
      ],
    };
    saveIndex(index, baseDir);
    expect(loadIndex(baseDir)).toEqual(index);
  });
});

describe("blueprint", () => {
  it("returns null when no blueprint exists", () => {
    expect(loadBlueprint("nonexistent", baseDir)).toBeNull();
  });

  it("round-trips blueprint and generates plan.md", () => {
    const bp = sampleBlueprint();
    saveBlueprint(bp, baseDir);
    expect(loadBlueprint("bp-1", baseDir)).toEqual(bp);

    const planPath = join(baseDir, "bp-1", "plan.md");
    expect(existsSync(planPath)).toBe(true);
    const planContent = readFileSync(planPath, "utf-8");
    expect(planContent).toContain("# Blueprint: Test objective");
  });
});

describe("history", () => {
  it("appends entries to history.jsonl", () => {
    const entry: HistoryEntry = {
      timestamp: "2026-04-11T00:00:00.000Z",
      event: "task_completed",
      phase_id: "1",
      task_id: "1.1",
      session_id: "s-1",
      details: "Completed task",
    };
    appendHistory("bp-1", entry, baseDir);
    appendHistory("bp-1", { ...entry, task_id: "1.2" }, baseDir);

    const content = readFileSync(join(baseDir, "bp-1", "history.jsonl"), "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toEqual(entry);
  });
});

describe("sessions", () => {
  it("returns null when no sessions file", () => {
    expect(loadSessions("nonexistent", baseDir)).toBeNull();
  });

  it("round-trips sessions", () => {
    const sessions: SessionsState = {
      sessions: [
        {
          session_id: "s-1",
          started_at: "2026-04-11T00:00:00.000Z",
          ended_at: null,
          tasks_worked: ["1.1"],
          tasks_completed: [],
        },
      ],
    };
    saveSessions("bp-1", sessions, baseDir);
    expect(loadSessions("bp-1", baseDir)).toEqual(sessions);
  });
});
