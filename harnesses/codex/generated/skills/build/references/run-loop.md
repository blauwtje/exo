# The loop, steps 1-6

1. **Find the plan, settle the workspace, then start the run.** Run `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/skills/build/scripts/start-run.mjs" --find-only`.
   - Zero or several matches is the question.
   - Settle where the run commits.
   - Read the plan's `Repository:` and `Branch:` lines.
   - Rerun `start-run.mjs --plan <path> --checkout <checkout>`.
   - Invoking build authorizes commits there and a wave's worktrees beside it; a push or pull request waits for the user's answer to `ship`.
2. **Read the frame, not the plan.** Read `## Goal`, `## Plan basis`, `## Success criterion`, `## Checkpoint`, plus `## Non-goals`, `## Context`, `## Decisions`, `## Visual direction` if present. List tasks with `grep -n '^### Task [0-9]' <plan>`; never open or `@`-reference it.
3. **Ask the branch what landed.** Run `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/skills/build/scripts/next-task.mjs" --plan <plan> --root <checkout>`; `Next: none` goes to step 7, `Route:` picks step 5's route.
   - Only a `Plan-task:` commit decides what landed, never memory.
   - On a restart, once, write one line in the reply language naming the landed tasks and the next; later loops stay silent.
4. **Form the block.**
   - Under `Route: unit`, the block is the current and later unlanded tasks in plan order, max eight, ending before a `Design:` task or an unlanded `Depends on:` outside the block.
   - A current `Design:` task routes, then step 3 repeats.
   - An open choice the user would miss stops with a question; any other is ruled, recorded in the commit.
5. **Dispatch.** Dispatch silently, then wait for each agent with `wait_agent`.
   - Until all returns are in, never call ScheduleWakeup, ListAgents, Monitor or sleep or read a worktree or report.
   - A wave lands only after every sibling returned.
   - `Route: unit`: **dispatch the unit**, never build a `Wave:` here.
   - Send each block to the `exo-run-unit` agent, naming plan path, branch, checkout, `<skill>` (`{{SKILL_DIR}}` resolved), task numbers, the budget rule's hard agent (`exo-solve-hard`, `-high` or `-low`).
   - `Route: direct`: read the direct route reference; a `Next:` line sends its task, a `Wave:` line each task.
   - `Route: inline`: read `references/run-loop-inline.md`.
6. **Route the return.**
   - `BUDGET:` means unfinished, whatever its `done` list says: a fresh unit takes the rest from step 3.
   - `BLOCKED` with a question runs `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/skills/build/scripts/resume-plan.mjs" wait` before asking it.
   - `BLOCKED all nested dispatch unavailable` ends the turn asking to set `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` to 2+.
   - `LANDED` and `GREEN` need nothing bar pending `mcp:<tool>`: call `mcp__*__<tool>`.
   - No such tool: never shell it; report `Unverified: <command> (no mcp__*__<tool> in this session)`, no Done.
   - A failed call goes to the bug fixer; rerun, then `land-task.mjs --fix`.
   - Loop to step 3; only a block, failure or question earns a message.
