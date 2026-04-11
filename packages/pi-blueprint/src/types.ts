export type TaskStatus = "pending" | "in_progress" | "completed" | "blocked" | "skipped";

export type PhaseStatus = "pending" | "active" | "completed" | "verified";

export type VerificationType = "tests_pass" | "typecheck_clean" | "user_approval" | "custom_command";

export type BlueprintStatus = "draft" | "active" | "completed" | "abandoned";

export type HistoryEventType =
  | "blueprint_created"
  | "task_started"
  | "task_completed"
  | "task_blocked"
  | "task_skipped"
  | "phase_started"
  | "phase_completed"
  | "phase_verified"
  | "verification_passed"
  | "verification_failed"
  | "blueprint_completed"
  | "blueprint_abandoned";

export interface Task {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: TaskStatus;
  readonly acceptance_criteria: readonly string[];
  readonly file_targets: readonly string[];
  readonly dependencies: readonly string[];
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly session_id: string | null;
  readonly notes: string | null;
}

export interface VerificationGate {
  readonly type: VerificationType;
  readonly command: string | null;
  readonly description: string;
  readonly passed: boolean;
  readonly last_checked_at: string | null;
  readonly error_message: string | null;
}

export interface Phase {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: PhaseStatus;
  readonly tasks: readonly Task[];
  readonly verification_gates: readonly VerificationGate[];
  readonly started_at: string | null;
  readonly completed_at: string | null;
}

export interface Blueprint {
  readonly id: string;
  readonly objective: string;
  readonly project_id: string;
  readonly status: BlueprintStatus;
  readonly created_at: string;
  readonly updated_at: string;
  readonly phases: readonly Phase[];
  readonly active_phase_id: string | null;
  readonly active_task_id: string | null;
}

export interface HistoryEntry {
  readonly timestamp: string;
  readonly event: HistoryEventType;
  readonly phase_id: string | null;
  readonly task_id: string | null;
  readonly session_id: string;
  readonly details: string;
}

export interface SessionRecord {
  readonly session_id: string;
  readonly started_at: string;
  readonly ended_at: string | null;
  readonly tasks_worked: readonly string[];
  readonly tasks_completed: readonly string[];
}

export interface SessionsState {
  readonly sessions: readonly SessionRecord[];
}

export interface BlueprintIndexEntry {
  readonly id: string;
  readonly objective: string;
  readonly status: BlueprintStatus;
  readonly created_at: string;
  readonly project_id: string;
}

export interface BlueprintIndex {
  readonly active_blueprint_id: string | null;
  readonly blueprints: readonly BlueprintIndexEntry[];
}

export interface ProjectInfo {
  readonly id: string;
  readonly name: string;
  readonly root: string;
}

export interface BlueprintExtensionState {
  readonly project: ProjectInfo | null;
  readonly blueprint: Blueprint | null;
  readonly sessionId: string;
}

export interface StateRef {
  get: () => BlueprintExtensionState;
  set: (s: BlueprintExtensionState) => void;
}

export interface VerificationResult {
  readonly passed: boolean;
  readonly output: string;
  readonly duration_ms: number;
}

export function isTaskDone(task: Task): boolean {
  return task.status === "completed" || task.status === "skipped";
}

export function getCompletedTaskIds(tasks: readonly Task[]): Set<string> {
  return new Set(tasks.filter(isTaskDone).map((t) => t.id));
}
