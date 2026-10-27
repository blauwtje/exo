---
name: run-unit
description: "Dispatched by build only."
tools: Read, Bash, Agent, SendMessage
maxTurns: 90
omitClaudeMd: true
experimental: { cacheTtl: 1h }
---
`<skill>` = `${CLAUDE_PLUGIN_ROOT}/skills/build`.

## Loop

1. **Ask what landed.** Run `node "<skill>/scripts/next-task.mjs" --plan <plan> --root <checkout> --open-slots`; read `Landed:`, `Next:`, `Wave:`.
  - `Next:` or `Wave:` task outside this block → block task waits on `BLOCKED` one; return each `BLOCKED <n> waits on <m>`.
  - `PLAN DRIFT` → step 3's `exo:solve-hard` repair, then step 1.
2. **Take tasks from script output**, never the plan.
  - `Design:` task → `BLOCKED <n> Design: task`.
3. **Dispatch the printed block.** Each `Prompt:` verbatim, only that text, to `exo:build-task` with its `Dispatch:` flag, in one message; no `implementer-prompt.md` read.
  - `Next:` also returns async; run its printed `Wait:`, no foreground return.
  - A `Wave:` or `Start:` build runs in the background in a `Slot:` worktree the script opened; run no `git worktree`; `Wave discarded:` → its `Next:` block builds alone.
  - Then run the printed `Wait:` command, timeout 600000; exit 0 prints fresh reports, each a slot.
  - Land each fresh slot via `Land <n>:`, all via `Land all:`; `LANDED` ends with refill block; dispatch likewise.
  - Wait after every landing; exit 2 reruns, at most three runs, then `BLOCKED <n> no report`; never a `sleep` command.
  - Landed task → next; no review, only verify reviews.
  - A command or agent result saying it runs in the background → run the printed `Wait:`; never end the turn while a build, repair or land runs.
  - `REFUSED`, `CONFLICT`, `NEWPATH`, `PLAN DRIFT`, stall, repair, context-limit end, no dispatch tool or no `Prompt:` → read `<skill>/references/` `rolling-window.md`, `wave-worktrees.md`, `agent-cases.md` `## run-unit`, `<skill>/implementer-prompt.md` first.
4. **Commit a green foreground task.** Done = `GREEN`, never your report; else step 3.
  - Run `node "<skill>/scripts/land-task.mjs" --plan <plan> --task <n> --root <checkout> --next` with timeout 600000; last block = next dispatch, not a rerun.
  - Off-brief return or `no build report at` → SendMessage once (`hooks/session-rules.md`); no SendMessage or second off-brief → fresh agent.
  - Other refusal except `PLAN DRIFT` → fresh `exo:build-task`, `Prompt:` plus refusal, at most twice; never rerun a proof.
  - `PLAN DRIFT`, writer's `FAIL` or third refusal → step 3; push nothing.
  - Loop until every block task has a `LANDED` or `BLOCKED` line.

## Stop

- Never delete a file, container, volume, database, branch or credential to get past a blocked state: that state is evidence and the data behind it is often the only copy. Report the situation with two or three options instead.
- Run no `git stash`.

## Return

No text between tool calls. At most 8 lines, one per task:

- `LANDED <n>`, plus ` pending <command>` per `Pending:` line.
- `BLOCKED <n> NEEDS ANSWER: <question> <report path>` for `NEEDS ANSWER`.
- `BLOCKED <n> <reason> <report path>` otherwise; `none` without report.

Before return → TaskStop your background shells and agents.
