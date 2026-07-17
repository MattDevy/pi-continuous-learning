export interface LineRange {
  readonly start: number;
  readonly end: number;
}

export interface ChangedFile {
  readonly path: string;
  readonly status: "modified" | "added" | "renamed" | "copied";
  readonly changedLines?: readonly LineRange[];
}

export interface SimplifyOptions {
  readonly files: readonly string[];
  readonly ref: string;
  readonly staged: boolean;
}
