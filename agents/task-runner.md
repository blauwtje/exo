---
name: task-runner
description: "Dispatched by build only."
tools: Read, Write, Bash, Agent, SendMessage, TaskStop
maxTurns: 90
omitClaudeMd: true
experimental: { cacheTtl: 1h }
---
# Plan runner

Land the lead's block; `<skill>` = `${CLAUDE_PLUGIN_ROOT}/skills/build`.

1. **Ask what landed.** Run `node "<skill>/scripts/next-task.mjs" --plan <plan> --root <checkout> --open-slots --only <block>`; read `Landed:`, `Next:`, `Wave:`.
  - A task outside this block waits on a `BLOCKED` one: return `BLOCKED <n> waits on <m>`.
  - On `PLAN DRIFT`, read `Then:`, run step 3 then 1 to repair, or return `BLOCKED <n> <path>` to stop.
  - On `BLOCKED input unreadable: <path>`, return `BLOCKED <n> <path>`.
2. **Take tasks from script output.** Change only what the request names.
  - A `Design:` task is `BLOCKED <n> Design: task`.
3. **Dispatch the printed block.** Send each `Prompt:` verbatim to `exo:build-task` with its `Dispatch:` flag, in one message.
  - A `Wave:`/`Start:` build runs in the script's `Slot:` worktree, so run no `git worktree`; after `Wave discarded:` its `Next:` block builds alone.
  - After `Async agent launched`, end your turn to wait (W1). In a `-p` run session run `Wait:` (W2), timeout 600000, never a `sleep` loop; exit 2 reruns per kind `wait`, then `BLOCKED <n> no report`.
  - `Detail:` names a script's full log; read it only on a failure.
  - Land a returned slot with `Land <n>:`, all with `Land all:`; a `LANDED` refill likewise.
  - When a build returns no report, send it one SendMessage to write it; if none follows, keep its slot, do not `sleep`.
  - On `REFUSED`, a repair, the context limit or no dispatch tool, read `<skill>/references/agent-cases.md` `## task-runner`, and `rolling-window.md` with `Slot:`.
  - On a missing report with `Slot:`, `CONFLICT` or `NEWPATH`, read `rolling-window.md` first, plus `wave-worktrees.md` for the last two.
  - With no `Prompt:`, read `<skill>/implementer-prompt.md`.
4. **Commit a green foreground task.** Done means `GREEN`, not your report.
  - Run `node "<skill>/scripts/land-task.mjs" --plan <plan> --task <n> --root <checkout> --next` with timeout 600000: its last block is the next dispatch, not a rerun. No report file: pipe it to `--report -`.
  - Off-brief return: send one SendMessage (`hooks/session-rules.md`); on a second, a fresh agent.
  - Other refusal: read `Then:`, give a fresh `exo:build-task` the `Prompt:` and refusal, no rerun.
  - Writer's `FAIL`: go to step 3, push nothing.
  - Loop until every block task has a `LANDED` or `BLOCKED` line.

## Return

Write no text between calls; return at most 8 lines, one per task:

- `LANDED <n>` plus ` pending <command>` per `Pending:`.
- `BLOCKED <n> NEEDS ANSWER: <question> <report path>`.
- `BLOCKED <n> <reason> <report path>` otherwise (or `none`).

Write the final result after your shells end; TaskStop takes a shell id from your own Bash result, never an agent id.
