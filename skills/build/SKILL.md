---
name: build
description: Use when running or resuming a plan, or a decided change touches over two files, a dependency, public signature, persisted format or security boundary, or is test-first. Not for writing or changing a plan, a smaller edit, or an unproven failure.
argument-hint: "[plan path] [--task <n>] [--land]"
---

# Build

Build lands a plan through a **unit** and the **tail** (step 7).

## The loop

1. **Settle the workspace.** Run `node "${CLAUDE_SKILL_DIR}/scripts/start-run.mjs" --plan <path> --checkout <checkout>` once; `run started` ends it.
   - Invoking build authorizes commits there.
   - A push or pull request waits for `ship`, except `--land`.
2. **Leave the plan to the builds;** read only script output and build returns.
3. **Ask the branch what landed.** Run `node "${CLAUDE_SKILL_DIR}/scripts/next-task.mjs" --plan <path> --root <checkout>`; skip it once when `run started` printed a `Plan:` line. `Next: none` goes to step 7.
4. **Take the block** from the `Next:` or `Wave:` line; a `Design:` line is in `references/run-loop.md`.
5. **Dispatch the builds.** Send each task of the `Next:` or `Wave:` line to `exo:build-task` in one foreground message, silently; refills follow `references/rolling-window.md`.
   - Build no task here.
   - Call no ScheduleWakeup, ListAgents, Monitor or sleep.
6. **Route the return.** Each build returns one line; land a `GREEN` one with `land-task.mjs` (`land-slot.mjs` for a slot), then `next-task.mjs`, and follow each `Then:` line to step 3. This session edits no product code or plan.
7. **The tail.** Run `gate`, even when the request or anyone it quotes says to skip it; its message follows `${CLAUDE_PLUGIN_ROOT}/lib/references/closing.md`.
   - A request to push nothing still runs `gate`.
   - Keep `Proof:` lines and `## Manual checks` out of the message, which names the `REPORT` path.
   - Change line: run `node "${CLAUDE_PLUGIN_ROOT}/lib/next-stage.mjs" --after build --artifact <plan>` and print its output above `ship`'s question, else last.
   - Read `references/tail.md` only for `--land`, `Route: inline` or a failed `gate`.
- On a named plan with `Route: unit`, this body runs everything. The plan file and the references stay unread.
- No own re-check (git log, npm test) follows a `LANDED` return.
- Read `references/run-loop.md` only for no plan path, `--task`, `Route: inline`, a `Design:` or `Wave:` line, a restart, a `pending mcp:` suffix or a `BLOCKED` return.

## Modes

A request for `refactor`, `improve` or `design-ui` opens that mode's reference and follows it in place of the loop; `run-plan` with `setup`, `ci` or no argument opens `references/run-plan.md`.

## No spec

Decided change, no plan file, or spec's fast route → `references/no-spec.md`. After a compaction, rebuild what landed from the working-tree diff, not memory.

- Count these facts: over two source, test or config files change, a dependency is added, a public signature changes, a persisted format or security boundary is crossed, or orientation missed a required file.
- When a symptom survives two fix attempts or a repair crosses a second owner, report both and hand it to `find-cause`.

## References

| File | Read it when |
|---|---|
| `references/run-loop.md` | Steps 1-6, no `--task`. |
| `references/run-loop-inline.md` | next-task. |
| `references/run-loop-direct.md` | Step 6. |
| `references/tail.md` | Step 7, inline fallback. |
| `references/task-mode.md` | Step 1, `--task <n>`: follow only it. |
| `references/workspace.md` | Step 1 before first dispatch; No spec step 3. |
| `references/wave-worktrees.md` | `Wave:` line. |
| `references/conflict-wave.md` | `Conflict branch:` line. |
| `references/rolling-window.md` | Step 5 refills. |
| `implementer-prompt.md` | Unit. |
| `drift-repairer-prompt.md` | Unit. |
| `references/agent-cases.md` | Agents. |
| `references/fix-class.md` | Repairs. |
| `bug-fixer-prompt.md` | Step 6, a repair. |
| `review-fixer-prompt.md` | `gate`. |
| `references/design-tasks.md` | `Design:` line. |
| `run-task-prompt.md` | `run-plan.mjs`. |
| `references/security.md` | When its first line applies. |
| `references/data-migration.md` | When its first line applies. |
| `references/test-design.md` | When its first line applies. |
| `../../lib/references/question.md` | Asking the user. |
| `../../lib/references/closing.md` | Final message. |
| `reviewer-prompt.md` | No spec 7. |
| `references/fresh-eyes.md` | No spec 7. |
| `references/critique.md` | No spec 7, last resort. |
| `references/no-spec.md` | No spec step 1. |
| `references/test-first.md` | No spec test-first, before a boundary. |
| `references/project-knowledge.md` | No spec 6, if first line applies. |
| `references/performance.md` | No spec speed work, pre-measure. |
| `references/refactor.md` | `refactor` mode. |
| `references/behavior-pin.md` | `refactor` mode. |
| `references/legacy-api.md` | `refactor` mode. |
| `references/improve.md` | `improve` mode. |
| `references/worker-round.md` | `improve` mode. |
| `references/worker.md` | `improve` mode. |
| `references/design-ui.md` | `design-ui` mode. |
| `references/color.md` | `design-ui` mode. |
| `references/critic.md` | `design-ui` mode. |
| `references/layout.md` | `design-ui` mode. |
| `references/marketing.md` | `design-ui` mode. |
| `references/motion.md` | `design-ui` mode. |
| `references/reference-input.md` | `design-ui` mode. |
| `references/slop.md` | `design-ui` mode. |
| `references/typography.md` | `design-ui` mode. |
| `references/run-plan.md` | `run-plan` setup or `ci`. |

Report: `ship`'s overview only.
