export function getBlueprintGeneratePrompt(objective: string): string {
  return `You are a senior software architect planning a complex implementation.

## Objective
${objective}

## Instructions

Analyze the codebase and the objective above, then create a phased construction plan by calling the \`blueprint_create\` tool.

### Plan structure requirements:
1. Break the work into 2-6 phases, ordered by dependency (foundations first)
2. Each phase should have 2-8 concrete, agent-sized tasks
3. Each task must have:
   - A clear, imperative title (e.g., "Add OAuth2 callback endpoint")
   - A brief description of what to implement
   - Acceptance criteria (testable conditions)
   - File targets (files to create or modify)
   - Dependencies on other tasks (by task ID, e.g., "1.1", "2.3")
4. Each phase should have verification gates:
   - Phase 1 typically: tests_pass
   - Later phases: tests_pass + typecheck_clean
   - Final phase: tests_pass + typecheck_clean + user_approval (optional)
5. Tasks within a phase can depend on other tasks (within or across phases)
6. Task IDs follow the format "phase.task" (e.g., "1.1", "1.2", "2.1")

### Quality criteria:
- Each task should be completable in a single agent session
- Dependencies should be minimal and acyclic
- Acceptance criteria should be specific and testable
- File targets should reference real paths in the codebase when possible

Call the \`blueprint_create\` tool with the structured plan.`;
}
