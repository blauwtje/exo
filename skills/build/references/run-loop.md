# The loop, steps 1-6

1. **Find the plan, settle the workspace, then start the run.** Run `node "${CLAUDE_SKILL_DIR}/scripts/start-run.mjs" --find-only`.
   - Zero or several matches is the question.
   - Settle where the run commits.
   - Read the plan's `Repository:` and `Branch:` lines.
   - Rerun `start-run.mjs --plan <path> --checkout <checkout>` once; its `run started` line ends step 1.
   - Invoking build authorizes commits there and a wave's worktrees beside it; a push or pull request waits for the user's answer to `ship`.
2. **Leave the plan to the unit.** This session never reads the plan body, a diff, a report or a worktree; it reads only script output and one-line returns.
   - The unit reads the frame: `## Goal`, `## Plan basis`, `## Success criterion`, `## Checkpoint`, plus `## Non-goals`, `## Context`, `## Decisions`, `## Visual direction` if present; never the whole plan.
3. **Ask the branch what landed.** Run `node "${CLAUDE_SKILL_DIR}/scripts/next-task.mjs" --block --plan <plan> --root <checkout>`; `Next: none` goes to step 7.
   - Only a `Plan-task:` commit decides what landed, never memory.
   - On a restart, once, write one line in the reply language naming the landed tasks and the next; later loops stay silent.
4. **Take the block from the `Block:` line.**
   - A `Design:` line routes that task per the design tasks reference, then step 3 repeats.
   - An open choice the user would miss stops with a question; any other is ruled, recorded in the commit.
5. **Dispatch the unit.** Send the `Block:` tasks to the `exo:run-unit` agent, silently, then end the turn; its completion notification resumes it.
   - Name plan path, branch, checkout, `<skill>` (`${CLAUDE_SKILL_DIR}` resolved), task numbers, the budget rule's hard agent (`exo:solve-hard`, `-high` or `-low`).
   - Never build a task here, and never call ScheduleWakeup, ListAgents, Monitor or sleep while the unit runs.
6. **Route the return.** Each line reads `LANDED <n>` or `BLOCKED <n> <reason> <report path>`.
   - `LANDED` needs nothing bar a pending `mcp:<tool>`: call `mcp__*__<tool>`.
   - No such tool: never shell it; report `Unverified: <command> (no mcp__*__<tool> in this session)`, no Done.
   - A failed call goes to the bug fixer; rerun, then `land-task.mjs --fix`.
   - `BLOCKED` ends the turn with its reason and report path, or hands the path to a fresh agent; never read the report here.
   - `BUDGET:` means unfinished, whatever its `done` list says: a fresh unit takes the rest from step 3.
   - `BLOCKED all nested dispatch unavailable` asks to set `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` to 2+; if the user cannot, step 5 follows the direct route reference instead.
   - Loop to step 3; only a block, failure or question earns a message.
