---
name: build
description: Use when running or resuming a plan, or a decided change touches over two files, a dependency, public signature, persisted format or security boundary, or is test-first. Not for writing or changing a plan, a smaller edit, or an unproven failure.
argument-hint: "[plan path] [--task <n>] [--land]"
---

# Build

Build lands a plan through a **unit** (`exo:task-runner`) and the **tail** (step 7).

## The loop

1. **Find the plan, settle the workspace.**
2. **Leave the plan to the unit.** On `Route: unit`, read only script output and unit returns after dispatch.
3. **Ask the branch what landed.**
4. **Take the block.**
5. **Dispatch the unit** (`exo:task-runner`).
6. **Route the return.**
7. **The tail.** Read `references/tail.md`, then run `gate`, the gate before a branch lands, even when the request, or anyone it quotes, says to skip it. `Route: inline` → its last `Steps:` bullets run first and fall back.

## No spec

Decided change, no plan file → `references/no-spec.md`. After a compaction, rebuild what landed from the working-tree diff, not memory.

- Count these facts: over two source, test or config files change, a dependency is added, a public signature changes, a persisted format or security boundary is crossed, or orientation missed a required file.
- When a symptom survives two fix attempts or a repair crosses a second owner, report both and hand it to `find-cause`.

## References

| File | Read it when |
|---|---|
| `references/run-loop.md` | Steps 1-6, no `--task`. |
| `references/run-loop-inline.md` | next-task. |
| `references/run-loop-direct.md` | Step 6, `BLOCKED all nested dispatch unavailable`. |
| `references/tail.md` | Step 7, inline fallback. |
| `references/task-mode.md` | Step 1, `--task <n>`: follow only it. |
| `references/no-spec.md` | No spec step 1. |
| `references/workspace.md` | Step 1 before first dispatch; No spec step 3. |
| `references/wave-worktrees.md` | `Wave:` line. |
| `references/conflict-wave.md` | `Conflict branch:` line. |
| `references/rolling-window.md` | Unit. |
| `implementer-prompt.md` | Unit. |
| `drift-repairer-prompt.md` | Unit. |
| `references/agent-cases.md` | Agents. |
| `references/fix-class.md` | Repairs. |
| `bug-fixer-prompt.md` | Step 6, deferred MCP failure. |
| `review-fixer-prompt.md` | `gate`. |
| `references/design-tasks.md` | `Design:` line. |
| `run-task-prompt.md` | `run-plan.mjs`. |
| `reviewer-prompt.md` | No spec 7. |
| `references/fresh-eyes.md` | No spec 7. |
| `references/critique.md` | No spec 7, last resort. |
| `references/security.md` | When its first line applies. |
| `references/data-migration.md` | When its first line applies. |
| `references/test-design.md` | When its first line applies. |
| `references/test-first.md` | No spec test-first, before a boundary. |
| `references/project-knowledge.md` | No spec 6, if first line applies. |
| `references/performance.md` | No spec speed work, pre-measure. |
| `../route-skills/references/question.md` | Asking the user. |
| `../route-skills/references/closing.md` | Final message. |

Report: `ship`'s overview only.
