import type { Task } from "./types.js";
import { isTaskDone, getCompletedTaskIds } from "./types.js";

export function findBlockedTasks(tasks: readonly Task[]): readonly string[] {
  const completedIds = getCompletedTaskIds(tasks);
  return tasks
    .filter(
      (t) =>
        !isTaskDone(t) &&
        t.dependencies.length > 0 &&
        t.dependencies.some((dep) => !completedIds.has(dep)),
    )
    .map((t) => t.id);
}

export function isTaskReady(tasks: readonly Task[], taskId: string): boolean {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return false;
  if (isTaskDone(task)) return false;
  if (task.dependencies.length === 0) return true;
  const completedIds = getCompletedTaskIds(tasks);
  return task.dependencies.every((dep) => completedIds.has(dep));
}

export function getBlockingTasks(tasks: readonly Task[], taskId: string): readonly string[] {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return [];
  const completedIds = getCompletedTaskIds(tasks);
  return task.dependencies.filter((dep) => !completedIds.has(dep));
}

export function detectCycles(tasks: readonly Task[]): readonly (readonly string[])[] {
  const ids = new Set(tasks.map((t) => t.id));
  const adj = new Map<string, readonly string[]>();
  for (const t of tasks) {
    adj.set(t.id, t.dependencies.filter((d) => ids.has(d)));
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of ids) color.set(id, WHITE);

  const cycles: string[][] = [];
  const stack: string[] = [];

  function dfs(node: string): void {
    color.set(node, GRAY);
    stack.push(node);

    for (const neighbor of adj.get(node) ?? []) {
      const c = color.get(neighbor);
      if (c === GRAY) {
        const cycleStart = stack.indexOf(neighbor);
        cycles.push(stack.slice(cycleStart));
      } else if (c === WHITE) {
        dfs(neighbor);
      }
    }

    stack.pop();
    color.set(node, BLACK);
  }

  for (const id of ids) {
    if (color.get(id) === WHITE) dfs(id);
  }

  return cycles;
}

export function topologicalSort(tasks: readonly Task[]): readonly string[] {
  const ids = new Set(tasks.map((t) => t.id));
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const id of ids) {
    adj.set(id, []);
    inDegree.set(id, 0);
  }

  for (const t of tasks) {
    for (const dep of t.dependencies) {
      if (ids.has(dep)) {
        adj.get(dep)!.push(t.id);
        inDegree.set(t.id, (inDegree.get(t.id) ?? 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const result: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);
    for (const neighbor of adj.get(node) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return result;
}

export function getAllTasks(phases: readonly { readonly tasks: readonly Task[] }[]): readonly Task[] {
  return phases.flatMap((p) => p.tasks);
}
