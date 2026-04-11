# pi-blueprint

A Pi extension that turns high-level objectives into phased, multi-session construction plans with dependency tracking and verification gates.

## Installation

```bash
pi install npm:pi-blueprint
```

## Commands

| Command | Description |
|---|---|
| `/blueprint <objective>` | Generate a phased plan from an objective |
| `/blueprint abandon` | Abandon the active blueprint |
| `/plan-status` | Show detailed progress with completion percentage |
| `/plan-verify` | Run verification gates for the current phase |
| `/plan-next` | Get and start the next actionable task |

## LLM Tools

| Tool | Description |
|---|---|
| `blueprint_create` | Create a new blueprint from structured phases |
| `blueprint_status` | Get current plan progress |
| `blueprint_update` | Mark tasks as completed, in_progress, or skipped |
| `blueprint_next` | Get the next actionable task |

## How It Works

1. Run `/blueprint "Add OAuth2 authentication"` to start
2. The LLM generates a phased plan with tasks, dependencies, and verification gates
3. On each session start, the active blueprint context is injected into the system prompt
4. Use `/plan-next` to work through tasks sequentially
5. Use `/plan-verify` to run phase verification gates (tests, typecheck) before advancing
6. Progress persists across sessions in `~/.pi/blueprints/`

## Storage

```
~/.pi/blueprints/
  index.json              # Active blueprint pointer
  <blueprint-id>/
    plan.md               # Human-readable plan (auto-generated)
    state.json            # Machine-readable state (source of truth)
    history.jsonl          # Audit log of state transitions
    sessions.json          # Session-to-task mapping
```

## Features

- **Phased execution**: Work is decomposed into ordered phases with verification gates
- **Dependency tracking**: Tasks declare dependencies; blocked tasks are surfaced automatically
- **Verification gates**: Tests, type-check, user approval, or custom commands gate phase advancement
- **Multi-session persistence**: Plan state survives session restarts with context injection
- **Cycle detection**: Dependency cycles are rejected at blueprint creation time
