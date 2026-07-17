import type { ChangedFile } from "./types.js";

function formatFile(file: ChangedFile): string {
  if (file.status === "added") return `- ${file.path} (added; entire file is in scope)`;
  if (file.changedLines === undefined) {
    return `- ${file.path} (${file.status}; changed lines unavailable — inspect git diff before editing)`;
  }
  if (file.changedLines.length === 0) {
    return `- ${file.path} (${file.status}; deletions only — no current lines to simplify)`;
  }

  const ranges = file.changedLines.map(({ start, end }) => (
    start === end ? `${start}` : `${start}-${end}`
  ));
  return `- ${file.path} (${file.status}; changed lines: ${ranges.join(", ")})`;
}

export function buildSimplifyPrompt(files: readonly ChangedFile[]): string {
  const fileList = files.map(formatFile).join("\n");

  return `Review the following recently changed files and apply simplification improvements.

## Principles

- **Preserve functionality**: Never change what the code does. All existing tests must continue to pass.
- **Apply project standards**: Follow any conventions from CLAUDE.md or AGENTS.md in this project.
- **Enhance clarity**: Reduce unnecessary complexity and nesting, eliminate redundant code and abstractions, improve variable and function names, and consolidate related logic. Keep valuable comments that explain design rationale, business rules, non-obvious behaviour, or intent. Remove only truly redundant noise, such as \`// increment i\` above \`i++\`. Avoid nested ternary operators: prefer switch statements or if/else chains for multiple conditions.
- **Maintain balance**: Do not over-simplify. Avoid overly clever solutions that are hard to understand. Do not combine too many concerns into single functions. Do not remove helpful abstractions. Prioritize readability over fewer lines.

## Scope

Only review and modify the changed lines listed below. Changed line numbers refer to
the current file contents. You may read surrounding code for context, but must not
edit it. For added files, the entire file is considered changed.
${fileList}

## Process

1. Read each file listed above and inspect its changed lines
2. Identify concrete improvements within those lines (dead code, unclear names, redundant logic, inconsistent patterns)
3. Apply changes one file at a time, keeping every edit within the listed line ranges
4. After all changes, run existing tests to verify nothing is broken
5. Summarize what you changed and why

Do NOT add new features, change public APIs, or refactor code outside the listed
line ranges. If a worthwhile simplification would require editing unchanged code,
leave it alone and mention it in the summary instead.`;
}
