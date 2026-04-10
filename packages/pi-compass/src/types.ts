export interface ProjectInfo {
  readonly id: string;
  readonly name: string;
  readonly root: string;
  readonly remote: string;
}

export interface DirectoryEntry {
  readonly name: string;
  readonly type: "file" | "dir";
  readonly children?: readonly DirectoryEntry[];
}

export type PackageManager = "npm" | "cargo" | "go" | "pip" | "poetry" | "gradle" | "maven" | "composer" | "bundler" | "mix";

export interface PackageInfo {
  readonly manager: PackageManager;
  readonly name: string;
  readonly version?: string;
  readonly dependencies: readonly string[];
}

export interface FrameworkDetection {
  readonly name: string;
  readonly version?: string;
  readonly confidence: "definite" | "likely";
  readonly source: string;
}

export type EntryPointKind = "main" | "index" | "route" | "handler" | "config";

export interface EntryPoint {
  readonly path: string;
  readonly kind: EntryPointKind;
}

export interface BuildScript {
  readonly name: string;
  readonly command: string;
  readonly source: string;
}

export interface Convention {
  readonly source: string;
  readonly content: string;
}

export interface KeyFile {
  readonly path: string;
  readonly description: string;
}

export interface CodeMap {
  readonly projectId: string;
  readonly projectName: string;
  readonly generatedAt: string;
  readonly contentHash: string;
  readonly directoryTree: readonly DirectoryEntry[];
  readonly packages: readonly PackageInfo[];
  readonly frameworks: readonly FrameworkDetection[];
  readonly entryPoints: readonly EntryPoint[];
  readonly buildScripts: readonly BuildScript[];
  readonly conventions: readonly Convention[];
  readonly keyFiles: readonly KeyFile[];
}

export interface TourStep {
  readonly file: string;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly description: string;
}

export interface CodeTour {
  readonly projectId: string;
  readonly topic: string;
  readonly generatedAt: string;
  readonly steps: readonly TourStep[];
}

export interface CacheEntry<T> {
  readonly data: T;
  readonly contentHash: string;
  readonly createdAt: string;
}

export interface CompassConfig {
  readonly max_injection_chars: number;
  readonly inject_on_first_turn: boolean;
  readonly cache_enabled: boolean;
}

export interface StateRef {
  get: () => CompassState;
  set: (s: CompassState) => void;
}

export interface CompassState {
  readonly project: ProjectInfo | null;
  readonly turnCount: number;
  readonly codemapInjected: boolean;
  readonly cachedCodemap: CacheEntry<CodeMap> | null;
  readonly stale: boolean;
}
