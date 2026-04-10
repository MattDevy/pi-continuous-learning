import { existsSync } from "node:fs";
import { join } from "node:path";
import type { KeyFile } from "../types.js";

const KEY_FILES: readonly { path: string; description: string }[] = [
  { path: "README.md", description: "Project documentation" },
  { path: "LICENSE", description: "License file" },
  { path: "LICENSE.md", description: "License file" },
  { path: "CHANGELOG.md", description: "Release history" },
  { path: "CONTRIBUTING.md", description: "Contribution guidelines" },
  { path: "SECURITY.md", description: "Security policy" },
  { path: "ARCHITECTURE.md", description: "Architecture documentation" },
  { path: "AGENTS.md", description: "AI agent conventions" },
  { path: "CLAUDE.md", description: "Claude Code instructions" },
  { path: ".env.example", description: "Environment variable template" },
  { path: ".env.sample", description: "Environment variable template" },
  { path: "Dockerfile", description: "Container build definition" },
  { path: "docker-compose.yml", description: "Container orchestration" },
  { path: "docker-compose.yaml", description: "Container orchestration" },
  { path: "Makefile", description: "Build automation" },
  { path: ".github/workflows", description: "GitHub Actions CI/CD" },
  { path: ".gitlab-ci.yml", description: "GitLab CI/CD" },
  { path: "Jenkinsfile", description: "Jenkins pipeline" },
];

export function detectKeyFiles(cwd: string): readonly KeyFile[] {
  const results: KeyFile[] = [];

  for (const { path, description } of KEY_FILES) {
    if (existsSync(join(cwd, path))) {
      results.push({ path, description });
    }
  }

  return results;
}
