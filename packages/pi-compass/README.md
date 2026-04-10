# pi-compass

Codebase navigation for [Pi coding agent](https://github.com/nicholasgasior/pi-coding-agent) sessions. Generates structured codemaps and interactive code tours so agents (and developers) can orient themselves in unfamiliar repos without burning tokens on exploration.

## Installation

```bash
pi install npm:pi-compass
```

## Usage

### Generate a codebase map

```
/onboard
```

Analyzes the current repo and generates a structured map covering:
- Directory structure
- Package managers and dependencies
- Detected frameworks
- Entry points
- Build, test, and deploy scripts
- Coding conventions (from AGENTS.md, CLAUDE.md, lint configs, etc.)
- Key files (README, LICENSE, CI configs, etc.)

The map is cached and automatically injected into the agent's system prompt on the first turn of each session.

### Force regeneration

```
/onboard --refresh
```

### Take a code tour

```
/tour              # list available topics
/tour auth         # guided walkthrough of the auth module
/tour testing      # walkthrough of test infrastructure
/tour ci           # walkthrough of CI/CD configuration
```

Topics are detected automatically from directory structure and project configuration.

## LLM Tools

| Tool | Description |
|------|-------------|
| `codebase_map` | Returns the cached codemap (generates if missing) |
| `code_tour` | Returns a guided walkthrough for a topic, or lists available topics |

## How it works

All analysis is deterministic (no LLM calls). The extension reads config files, directory listings, and package manifests to build a structured overview. Results are cached per project with content-hash invalidation: the cache is marked stale when key config files or the directory structure changes.

### Cache invalidation

The content hash covers: package.json, tsconfig.json, go.mod, Cargo.toml, pyproject.toml, and the top-level directory listing. When any of these change, the cached codemap is marked stale. Stale maps are still served (better than nothing) with a note to run `/onboard` to refresh.

## Storage

```
~/.pi/compass/
  projects/<project-hash>/
    codemap.json        # Cached codemap
    tours/
      <topic>.json      # Cached tours
```

## License

MIT
