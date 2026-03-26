import { homedir } from "node:os";
import { join } from "node:path";

const LEARNING_BASE_DIR = join(homedir(), ".pi", "continuous-learning");

let analyzerRunning = false;

export function isAnalyzerRunning(): boolean {
  return analyzerRunning;
}

export function setAnalyzerRunning(value: boolean): void {
  analyzerRunning = value;
}

const LEARNING_BASE_DIR_PREFIX = LEARNING_BASE_DIR + "/";

export function shouldSkipPath(filePath: string): boolean {
  return filePath === LEARNING_BASE_DIR || filePath.startsWith(LEARNING_BASE_DIR_PREFIX);
}

export function shouldSkipObservation(filePath?: string): boolean {
  if (analyzerRunning) return true;
  if (filePath !== undefined && shouldSkipPath(filePath)) return true;
  return false;
}
