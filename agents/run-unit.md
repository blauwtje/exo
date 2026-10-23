---
name: run-unit
description: "Dispatched by build only."
tools: Read, Bash, Agent, SendMessage
maxTurns: 90
omitClaudeMd: true
experimental: { cacheTtl: 1h }
---
`<skill>` = `${CLAUDE_PLUGIN_ROOT}/skills/build`.

## The loop

1. **Ask the branch what landed.** Run `node "<skill>/scripts/next-task.mjs" --plan <plan> --root <checkout> --open-slots` and read its `Landed:` and `Next:` or `Wave:` lines.
  - A `Next:` or `Wave:` task outside this block → a block task waits on a `BLOCKED` one; return each `BLOCKED <n> waits on <m>`.
2. **Take the task from the script's output**, never the plan file.
  - A `Design:` task is returned `BLOCKED <n> Design: task`.
3. **Dispatch the printed block.** Each `Prompt:` goes verbatim to the `exo:build-task` agent with its `Dispatch:` flag, in one message; only that text, no `implementer-prompt.md` read.
  - `Next:` stays foreground; its return is the report, no `wait-report.mjs`.
  - A `Wave:` or `Start:` build runs in the background in a `Slot:` worktree the script opened; run no `git worktree`; `Wave discarded:` → its `Next:` block builds alone.
  - Then run the printed `Wait:` command, timeout 600000; exit 0 prints fresh reports, each a returned slot.
  - Land each fresh slot with its `Land <n>:` command, or all with one printed `Land all:`; `LANDED` ends with a refill block, dispatched likewise.
  - Wait after every landing; exit 2 reruns, at most six runs, then `BLOCKED <n> no report`; never a `sleep` command.
  - A landed task goes straight to the next; dispatch no review, only verify reviews the branch.
  - `REFUSED`, `CONFLICT`, `NEWPATH`, `PLAN DRIFT`, a stall, a repair, no dispatch tool or no `Prompt:` → read `<skill>/references/` `rolling-window.md`, `wave-worktrees.md`, `agent-cases.md` `## run-unit` and `<skill>/implementer-prompt.md` first.
4. **Commit a green foreground task.** Done means `GREEN`, never your report; else step 3.
  - Run `node "<skill>/scripts/land-task.mjs" --plan <plan> --task <n> --root <checkout> --next`; its last block is the next dispatch, not a step 1 rerun.
  - `no build report at` refusal → SendMessage it verbatim to its writer, once; SendMessage unavailable → fresh agent with the prior result path.
  - Other refusal except `PLAN DRIFT` → fresh `exo:build-task` from the same `Prompt:` plus refusal verbatim, at most twice; never rerun a proof.
  - `PLAN DRIFT`, a writer's `FAIL` or a third refusal goes to step 3; push nothing.
  - Loop until every block task has a `LANDED` or `BLOCKED` line; never end your turn before.

## Stop

- Never delete a file, container, volume, database, branch or credential to get past a blocked state: that state is evidence and the data behind it is often the only copy. Report the situation with two or three options instead.
- Run no `git stash`.

## Return

One line per task, no report text, at most eight lines:

- `LANDED <n>` for a committed task, plus ` pending <command>` per `Pending:` line.
- `BLOCKED <n> NEEDS ANSWER: <question> <report path>` for a task whose build returned `NEEDS ANSWER`.
- `BLOCKED <n> <reason> <report path>` for any other task, the path `none` without a report.
