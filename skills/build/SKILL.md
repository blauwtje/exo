---
name: build
description: Use when running or resuming a plan, or a decided change touches over two files, a dependency, public signature, persisted format or security boundary, or is test-first. Not for writing or changing a plan, a smaller edit, or an unproven failure.
argument-hint: "[plan path] [--task <n>] [--land]"
---

# Build

## The loop

1. **Find the plan, settle the workspace.**
2. **Leave the plan to the unit.** On `Route: unit`: After dispatch, read only script output and unit returns, no plan or diff.
3. **Ask the branch what landed.**
4. **Take the block.**
5. **Dispatch the unit.**
6. **Route the return.**
7. **The tail.** Read `references/tail.md`, then run `verify`, the gate before a branch lands, even when the request, or anyone it quotes, says to skip it. `Route: inline` → its last `Steps:` bullets run first and fall back to this step.

## No spec

Decided change with no plan file → `references/no-spec.md`. After a compaction, rebuild what landed from the working-tree diff, not memory.

- Count these facts: over two source, test or config files change; a dependency is added; a public signature changes; a persisted format or security boundary is crossed; orientation missed a required file.
- When a symptom survives two fix attempts or a repair crosses a second owner, report both and hand it to `find-cause`.

## References

| File | Read it when |
|---|---|
| `references/run-loop.md` | Steps 1-6, without `--task`. |
| `references/run-loop-inline.md` | Never here: next-task prints it. |
| `references/run-loop-direct.md` | Step 6, on `BLOCKED all nested dispatch unavailable`. |
| `references/tail.md` | Step 7; `Route: inline` only if its `Steps:` fall back. |
| `references/task-mode.md` | Step 1, `--task <n>`: follow only it. |
| `references/no-spec.md` | No spec step 1. |
| `references/workspace.md` | Step 1 before first dispatch; No spec step 3. |
| `references/wave-worktrees.md` | `references/run-loop-direct.md`, `Wave:` line. |
| `references/rolling-window.md` | Never here: unit reads it. |
| `references/agent-cases.md` | Never here: agents read it. |
| `implementer-prompt.md` | Never here: unit reads it. |
| `drift-repairer-prompt.md` | Never here: unit reads it. |
| `bug-fixer-prompt.md` | Step 6, failed deferred MCP call. |
| `review-fixer-prompt.md` | Never here: `verify` reads it. |
| `references/design-tasks.md` | Step 4, `Design:` line. |
| `run-task-prompt.md` | Never here: `run-plan.mjs` fills it. |
| `reviewer-prompt.md` | No spec step 7. |
| `references/fresh-eyes.md` | No spec step 7. |
| `references/critique.md` | No spec step 7, last fallback. |
| `references/security.md` | When its first line applies. |
| `references/data-migration.md` | When its first line applies. |
| `references/test-design.md` | When its first line applies. |
| `references/test-first.md` | No spec test-first work, before first boundary. |
| `references/project-knowledge.md` | No spec step 6, if its first line applies. |
| `references/performance.md` | No spec speed-only work, before measuring. |
| `../route-skills/references/question.md` | Before asking the user to pick. |
| `../route-skills/references/closing.md` | Before the final message. |

Report: `ship`'s overview only.
