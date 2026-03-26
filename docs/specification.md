# Pi Continuous Learning - Specification

## Overview

A Pi extension (packaged as a pi-package) that observes coding sessions, records events, and uses a background Haiku process to distill observations into reusable "instincts" - atomic learned behaviors with confidence scoring and project scoping.

Inspired by [everything-claude-code/continuous-learning-v2](https://github.com/nicholasb/everything-claude-code), reimplemented as a native Pi extension in TypeScript.

## Goals

1. **Observe** - capture tool calls, user prompts, and outcomes via Pi extension events
2. **Record** - write observations to project-scoped JSONL files
3. **Analyze** - run a background job every 5 minutes using Haiku to detect patterns
4. **Learn** - create/update instinct files (YAML-frontmatter markdown) with confidence scoring
5. **Apply** - inject relevant instincts into Pi's system prompt via `before_agent_start`
6. **Manage** - provide commands to view, export, import, evolve, and promote instincts

---

## Architecture

```
Pi Session
  |
  | Extension events (tool_call, tool_result, agent_end, etc.)
  v
+---------------------------------------------+
| Extension: observation collector             |
| - Captures tool use, errors, user prompts   |
| - Detects project via git remote / cwd      |
| - Writes to projects/<hash>/observations.jsonl
+---------------------------------------------+
  |
  | Every 5 minutes (setInterval in extension)
  v
+---------------------------------------------+
| Background analyzer (Pi CLI subprocess)      |
| - Spawns: pi -p --mode json --no-session     |
|   --model haiku --no-extensions --no-skills  |
|   --tools read,write                         |
| - Uses Pi's OAuth/subscription credentials   |
| - No per-request API cost                    |
| - Reads observations, writes instinct files  |
+---------------------------------------------+
  |
  v
+---------------------------------------------+
| Instinct storage                             |
| - projects/<hash>/instincts/personal/*.md    |
| - instincts/personal/*.md (global)           |
+---------------------------------------------+
  |
  | before_agent_start event
  v
+---------------------------------------------+
| System prompt injection                      |
| - Reads high-confidence instincts            |
| - Appends to system prompt for context       |
+---------------------------------------------+
```

---

## Package Structure

```
pi-continuous-learning/
  package.json              # pi-package manifest
  src/
    index.ts                # Extension entry point (default export)
    observer.ts             # Observation collection from Pi events
    analyzer.ts             # Background analysis via Pi CLI subprocess
    project.ts              # Project detection (git remote hash)
    instincts.ts            # Instinct CRUD (parse, load, save, merge)
    injector.ts             # System prompt instinct injection
    commands.ts             # Slash command handlers
    config.ts               # Configuration constants and types
    types.ts                # Shared type definitions
    prompts/
      analyzer-system.ts    # System prompt template for the Haiku analyzer
```

Published as a pi-package with:

```json
{
  "name": "pi-continuous-learning",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["src/index.ts"]
  },
  "peerDependencies": {
    "@mariozechner/pi-coding-agent": "*",
    "@mariozechner/pi-ai": "*",
    "@mariozechner/pi-tui": "*",
    "@sinclair/typebox": "*"
  }
}
```

No runtime dependencies needed - the analyzer runs via Pi CLI subprocess, reusing the user's existing subscription credentials.
```

---

## Data Model

### Observation (JSONL record)

```typescript
interface Observation {
  timestamp: string;              // ISO 8601 UTC
  event: "tool_start" | "tool_complete" | "user_prompt" | "agent_end";
  tool?: string;                  // Tool name (for tool events)
  input?: string;                 // Truncated tool input (max 5000 chars)
  output?: string;                // Truncated tool output (max 5000 chars)
  session: string;                // Session ID
  project_id: string;             // 12-char SHA256 hash of git remote URL
  project_name: string;           // Directory basename
  is_error?: boolean;             // Whether tool result was an error
}
```

### Instinct (YAML-frontmatter Markdown)

```yaml
---
id: prefer-functional-style
trigger: "when writing new functions"
confidence: 0.7
domain: "code-style"
source: "session-observation"
scope: project
project_id: "a1b2c3d4e5f6"
project_name: "my-react-app"
created_at: "2025-01-22T10:30:00Z"
updated_at: "2025-01-22T10:30:00Z"
observation_count: 5
---

# Prefer Functional Style

## Action
Use functional patterns over classes when appropriate.

## Evidence
- Observed 5 instances of functional pattern preference
- User corrected class-based approach to functional on 2025-01-15
```

```typescript
interface Instinct {
  id: string;                     // kebab-case unique identifier
  trigger: string;                // When this instinct applies
  confidence: number;             // 0.3 - 0.9
  domain: string;                 // code-style, testing, git, debugging, workflow, file-patterns, security
  source: "session-observation" | "repo-analysis" | "imported";
  scope: "project" | "global";
  project_id?: string;            // Only for project-scoped
  project_name?: string;          // Only for project-scoped
  created_at: string;             // ISO 8601
  updated_at: string;             // ISO 8601
  observation_count: number;      // How many observations back this instinct
  title: string;                  // Human-readable title
  action: string;                 // What to do
  evidence: string[];             // Supporting evidence lines
}
```

### Project Registry

```typescript
interface ProjectEntry {
  id: string;                     // 12-char SHA256 hash
  name: string;                   // Directory basename
  root: string;                   // Absolute path to project root
  remote: string;                 // Git remote URL (empty if none)
  created_at: string;
  last_seen: string;
}
```

---

## Storage Layout

```
~/.pi/continuous-learning/
  config.json                     # User configuration overrides
  projects.json                   # Registry: hash -> project metadata
  instincts/
    personal/                     # Global instincts
    inherited/                    # Imported global instincts
  projects/
    <hash>/
      project.json                # Project metadata
      observations.jsonl          # Current observations
      observations.archive/       # Archived observation files
      instincts/
        personal/                 # Project-scoped instincts
        inherited/                # Imported project instincts
      analyzer.log                # Background analyzer log
```

---

## Extension Events Used

### Observation Collection

| Pi Event | What We Capture |
|----------|----------------|
| `tool_call` | Tool name, input args (before execution) |
| `tool_result` | Tool name, output, isError flag (after execution) |
| `agent_start` | Session start, user prompt text |
| `agent_end` | Session end, messages from this prompt |
| `turn_end` | Turn completion with tool results summary |

### System Prompt Injection

| Pi Event | What We Do |
|----------|-----------|
| `before_agent_start` | Append high-confidence instincts to system prompt |

### Session Lifecycle

| Pi Event | What We Do |
|----------|-----------|
| `session_start` | Start background analyzer timer, load instincts |
| `session_shutdown` | Stop background analyzer timer, flush pending observations |

---

## Observation Collection (`observer.ts`)

### Event Handlers

1. **`tool_call`** - Record tool start event with tool name and truncated input. Skip observation of our own analyzer tool calls.
2. **`tool_result`** - Record tool completion with truncated output and error flag.
3. **`agent_start`** - Record user prompt text (from the event).
4. **`agent_end`** - Record session-level summary.

### Guards (Prevent Self-Observation)

- Skip recording when our own analyzer is running (track via a boolean flag)
- Skip recording for observation/instinct file operations (path-based filter)

### Secret Scrubbing

Before writing any observation, scrub common secret patterns:
- API keys, tokens, passwords, authorization headers
- Regex: `/(api[_-]?key|token|secret|password|authorization|credentials?|auth)(["'\s:=]+)([A-Za-z]+\s+)?([A-Za-z0-9_\-/.+=]{8,})/i`
- Replace matched value with `[REDACTED]`

### File Management

- Max observation file size: 10MB. When exceeded, archive to `observations.archive/` with timestamp.
- Auto-purge archived files older than 30 days (check once per session start).
- Write observations as append-only JSONL (one JSON object per line).

---

## Project Detection (`project.ts`)

Detection priority:
1. `ctx.cwd` from the extension context
2. `git remote get-url origin` - hash for portable cross-machine ID
3. `git rev-parse --show-toplevel` - fallback using repo path
4. `"global"` - if no project context detected

Project ID: first 12 characters of SHA256 hash of the git remote URL (or repo path as fallback).

Uses `pi.exec()` for git commands.

---

## Background Analyzer (`analyzer.ts`)

### Trigger

- `setInterval` running every 5 minutes (configurable) during an active Pi session
- Only runs if enough observations have accumulated (default: 20 minimum)
- Re-entrancy guard: skip if analysis is already in progress
- Session guardian: only run during active hours (8am-11pm), skip if user idle >30 min

### Why Pi CLI Subprocess (Not Direct API)

We considered three approaches:

| Approach | Cost | Complexity | Subscription |
|----------|------|-----------|-------------|
| `@anthropic-ai/sdk` direct | Per-request pricing | Low | Needs separate API key |
| Pi SDK (`createAgentSession`) | Subscription-included | Medium | Uses Pi's OAuth tokens |
| Pi CLI subprocess (`pi -p`) | Subscription-included | Low | Uses Pi's OAuth tokens |

**Decision: Pi CLI subprocess.** Reasons:

1. **No per-request cost** - uses the same Claude subscription/OAuth credentials as the main Pi session. No separate `ANTHROPIC_API_KEY` needed.
2. **No extra dependencies** - no `@anthropic-ai/sdk` package needed. The analyzer just spawns the `pi` binary that's already installed.
3. **Process isolation** - the analyzer runs in a separate process, so a crash or timeout can't affect the main session. Easy to kill with SIGTERM.
4. **Proven pattern** - Pi's own `subagent` extension uses exactly this pattern (spawn `pi --mode json -p`).
5. **Self-observation prevention** - the subprocess runs with `--no-extensions --no-skills`, so our extension doesn't load in the analyzer process. No infinite loops.

The Pi SDK (`createAgentSession`) was also viable but has downsides:
- Runs in the same Node.js process - a hung analysis blocks the extension event loop
- Requires more setup (AuthStorage, ModelRegistry, ResourceLoader, SessionManager)
- Harder to timeout and kill cleanly
- Extension re-entrancy concerns (our extension loading inside its own analysis session)

### Implementation

The analyzer spawns a Pi subprocess using `child_process.spawn`:

```typescript
import { spawn } from "node:child_process";

function runAnalysis(promptFile: string, cwd: string): Promise<AnalysisResult> {
  const args = [
    "--mode", "json",           // Structured output we can parse
    "-p",                       // Print mode (non-interactive, exit when done)
    "--no-session",             // Ephemeral, don't save session history
    "--model", "claude-haiku-4-5",  // Cheap, fast model
    "--tools", "read,write",    // Only needs to read observations + write instincts
    "--no-extensions",          // Prevent our extension from loading (no self-observation)
    "--no-skills",              // No skill overhead
    "--no-prompt-templates",    // No prompt template overhead
    "--no-themes",              // No theme overhead
    "--append-system-prompt", promptFile,  // Analysis instructions (file path)
  ];

  // The user message tells Haiku what to analyze and where files are.
  // The system prompt (in promptFile) contains the instinct format spec,
  // pattern detection rules, and confidence scoring guidelines.
  args.push(buildUserPrompt(observationsPath, instinctsDir, projectContext));

  const proc = spawn("pi", args, {
    cwd,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Parse JSON events from stdout (same as subagent pattern)
  // Track tool_result_end events to see what files were written
  // Timeout after 120 seconds
}
```

The subprocess uses Pi's existing OAuth credentials (from `~/.pi/agent/auth.json`) automatically. The user's Claude subscription covers the Haiku usage at no additional cost.

### Analysis Strategy

Rather than asking Haiku for structured JSON and doing file I/O ourselves, we give Haiku the `read` and `write` tools and let it:

1. **Read** the observations file and existing instinct files
2. **Detect patterns**: user corrections, error resolutions, repeated workflows, tool preferences
3. **Write** instinct `.md` files directly to the instincts directory

This is simpler than parsing structured output - Haiku writes the files, we just monitor for success/failure via the JSON event stream.

The system prompt instructs Haiku on:
- The exact instinct file format (YAML frontmatter + markdown)
- Where to read observations from and write instincts to
- Pattern detection heuristics
- Confidence scoring rules
- Scope decision guide (project vs global)
- Rules: be conservative, only clear patterns with 3+ observations, never include code snippets

### Pattern Detection

| Pattern Type | Detection Method | Example |
|-------------|-----------------|---------|
| User corrections | User prompt follows tool error or undo | "No, use X instead" |
| Error resolutions | Error tool_result followed by successful fix | Build error -> fix -> pass |
| Repeated workflows | Same tool sequence 3+ times | Grep -> Read -> Edit |
| Tool preferences | Consistent tool choice for similar tasks | Always uses grep before edit |

### Confidence Scoring

| Observation Count | Initial Confidence |
|------------------|--------------------|
| 1-2 | 0.3 (tentative) |
| 3-5 | 0.5 (moderate) |
| 6-10 | 0.7 (strong) |
| 11+ | 0.85 (very strong) |

Adjustments:
- +0.05 per confirming observation
- -0.1 per contradicting observation
- -0.02 per week without observation (decay, applied at analysis time)
- Cap: 0.9 maximum

### Timeout and Safety

- Analysis timeout: 120 seconds (SIGTERM the subprocess)
- Max observations per analysis: 500 (tail the JSONL file before passing to Haiku)
- Max concurrent analyses: 1 (re-entrancy guard via boolean flag)
- Cooldown between analyses: 60 seconds minimum
- Subprocess killed on `session_shutdown` event

---

## System Prompt Injection (`injector.ts`)

On `before_agent_start`, load and inject relevant instincts:

1. Load project-scoped instincts (if in a project)
2. Load global instincts
3. Filter to confidence >= 0.5 (configurable threshold)
4. Sort by confidence descending
5. Take top N instincts (default: 20, configurable)
6. Format as a concise section appended to the system prompt

### Injection Format

```
## Learned Behaviors (Instincts)

The following patterns have been learned from previous sessions. Apply them when relevant:

- [0.9] When modifying code: Search with grep, confirm with read, then edit
- [0.7] When writing React components: Use functional components with hooks
- [0.5] When handling errors in this project: Use Result type pattern
```

---

## Commands (`commands.ts`)

### `/instinct-status`

Show all instincts (project + global) grouped by domain, with confidence scores.

Implementation: `pi.registerCommand("instinct-status", ...)`

### `/instinct-evolve`

Cluster related instincts and suggest evolution into higher-order constructs:
- Related instincts -> skill file
- Workflow instincts -> command
- Suggest promotions from project to global

Implementation: `pi.registerCommand("instinct-evolve", ...)`

### `/instinct-export`

Export instincts to a JSON file, filterable by scope and domain.

Implementation: `pi.registerCommand("instinct-export", ...)`

### `/instinct-import <path>`

Import instincts from a JSON file with scope control.

Implementation: `pi.registerCommand("instinct-import", ...)`

### `/instinct-promote [id]`

Promote project instincts to global scope. Without ID, auto-promotes all qualifying instincts (seen in 2+ projects with confidence >= 0.8).

Implementation: `pi.registerCommand("instinct-promote", ...)`

### `/instinct-projects`

List all known projects and their instinct counts.

Implementation: `pi.registerCommand("instinct-projects", ...)`

---

## Configuration (`config.ts`)

Stored at `~/.pi/continuous-learning/config.json`:

```json
{
  "version": "1.0",
  "observer": {
    "enabled": true,
    "run_interval_minutes": 5,
    "min_observations_to_analyze": 20,
    "active_hours_start": 800,
    "active_hours_end": 2300,
    "max_idle_seconds": 1800
  },
  "injector": {
    "enabled": true,
    "min_confidence": 0.5,
    "max_instincts": 20
  },
  "analyzer": {
    "model": "claude-haiku-4-5",
    "timeout_seconds": 120,
    "max_observations_per_analysis": 500,
    "max_turns": 10
  },
  "storage": {
    "max_observation_file_mb": 10,
    "archive_retention_days": 30
  }
}
```

Defaults are used when config file is absent. The extension reads config on `session_start` and caches it.

---

## Extension Entry Point (`index.ts`)

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function(pi: ExtensionAPI) {
  // 1. Register event handlers for observation
  // 2. Register before_agent_start for instinct injection
  // 3. Start background analyzer on session_start
  // 4. Stop background analyzer on session_shutdown
  // 5. Register all slash commands
}
```

### Key Design Decisions

1. **Extension, not shell scripts** - Pi extensions are TypeScript, have full access to Pi events, and can interact with the UI. No need for bash hooks.

2. **Pi CLI subprocess for analysis** - The background analyzer spawns `pi -p --mode json --model haiku` as a child process. This reuses the user's Claude subscription (OAuth tokens in `~/.pi/agent/auth.json`) at no additional per-request cost. No `ANTHROPIC_API_KEY` environment variable needed.

3. **setInterval for scheduling** - The extension runs in Pi's Node.js process. A simple `setInterval` handles the 5-minute background job. Cleanup on `session_shutdown`.

4. **Haiku writes files directly via tools** - We give the subprocess `read` and `write` tools and instruct Haiku to read observations and write instinct files. This mirrors how the Claude Code version works and is simpler than parsing structured JSON output.

5. **`--no-extensions` prevents self-observation** - The subprocess runs with `--no-extensions --no-skills --no-prompt-templates --no-themes` so our extension doesn't load in the analyzer process. No infinite observation loops.

6. **System prompt injection via `before_agent_start`** - Pi's event system lets us cleanly append instincts to the system prompt each turn without modifying files.

7. **Storage under `~/.pi/`** - Uses Pi's conventional config location rather than `~/.claude/homunculus/`.

8. **Process isolation** - A hung or crashing Haiku analysis can't affect the main Pi session. The subprocess is killed on timeout (120s) or session shutdown.

---

## Scope Decision Guide

| Pattern Type | Scope | Examples |
|-------------|-------|---------|
| Language/framework conventions | **project** | "Use React hooks", "Follow Django REST patterns" |
| File structure preferences | **project** | "Tests in `__tests__`/", "Components in src/components/" |
| Code style | **project** | "Use functional style", "Prefer dataclasses" |
| Error handling strategies | **project** | "Use Result type for errors" |
| Security practices | **global** | "Validate user input", "Sanitize SQL" |
| General best practices | **global** | "Write tests first", "Always handle errors" |
| Tool workflow preferences | **global** | "Grep before Edit", "Read before Write" |
| Git practices | **global** | "Conventional commits", "Small focused commits" |

Default: **project** scope. Safer to be project-specific and promote later.

---

## Instinct Promotion Criteria

Auto-promotion from project to global when:
1. Same instinct ID exists in 2+ different projects
2. Average confidence across projects >= 0.8
3. Domain is in the global-friendly list (security, workflow, general-best-practices)

---

## Credential and Cost Model

The analyzer subprocess runs via `pi -p`, which:

1. Reads OAuth credentials from `~/.pi/agent/auth.json` (same as the main session)
2. Uses the user's existing Claude subscription (Max plan, Team plan, etc.)
3. Haiku usage is included in the subscription - **no per-request API charges**
4. No `ANTHROPIC_API_KEY` environment variable is needed
5. If the user is not logged in or has no subscription, the analyzer gracefully fails and logs a warning

This is the same credential path that Pi uses for all model interactions. The extension adds no new authentication requirements.

### Cost Estimate

Each analysis run uses roughly:
- ~500-2000 input tokens (observations + existing instincts + system prompt)
- ~500-1000 output tokens (instinct file writes)
- Running every 5 minutes during active sessions: ~12 runs/hour
- Haiku is the cheapest model available - negligible impact on subscription usage

---

## Privacy and Security

- All data stays local on the user's machine
- Secrets are scrubbed from observations before writing to disk
- Only instincts (patterns) can be exported - not raw observations
- No telemetry, no network calls except to Anthropic API for analysis
- Instinct file paths are validated against path traversal
- Instinct IDs are validated (kebab-case, no special characters)

---

## Testing Strategy

### Unit Tests

- `project.ts` - project detection from git remote, path fallback, hash generation
- `instincts.ts` - parse/serialize instinct files, merge logic, confidence calculations
- `observer.ts` - secret scrubbing, event filtering, observation formatting
- `config.ts` - config loading, defaults, validation

### Integration Tests

- Full observation -> analysis -> instinct creation pipeline
- Instinct injection into system prompt
- Import/export round-trip
- Promotion workflow

### E2E Tests

- Extension loads in Pi without errors
- Commands register and execute
- Background analyzer runs on schedule

---

## Implementation Phases

### Phase 1: Core Infrastructure
- Types, config, project detection
- Storage layout creation
- Instinct file CRUD

### Phase 2: Observation Collection
- Event handlers for tool_call, tool_result, agent_start, agent_end
- Secret scrubbing
- JSONL file management with archival

### Phase 3: Background Analyzer
- Pi CLI subprocess spawning (spawn `pi -p --mode json --model haiku`)
- Analysis system prompt construction
- JSON event stream parsing from subprocess stdout
- Timer management (start/stop/re-entrancy)
- Timeout handling (SIGTERM after 120s)

### Phase 4: System Prompt Injection
- Load and filter instincts
- Format injection block
- `before_agent_start` handler

### Phase 5: Commands
- `/instinct-status`
- `/instinct-evolve`
- `/instinct-export` and `/instinct-import`
- `/instinct-promote`
- `/instinct-projects`

### Phase 6: Polish
- Session guardian (active hours, idle detection)
- Confidence decay over time
- UI notifications for instinct creation
- Error handling and logging
