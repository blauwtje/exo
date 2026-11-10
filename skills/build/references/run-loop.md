# The loop, rare branches

The skill body holds steps 1-7 of the common route. This file holds only what it names.

- No plan path, or the request names the workspace: run `start-run.mjs --find-only`, plus `--plan <path>` for a named plan.
  - Skip `--find-only` for a named `--plan` whose basis names `Repository:` and `Branch:`, except when the request names the workspace: run `start-run.mjs --checkout <checkout>` once, same `--plan`.
  - Zero or several matches: ask which.
  - Take `Repository:` and `Branch:` from that output, not the plan; the run commits there.
  - Settle where the run commits before the first dispatch, as the table row for it says.
- Every session takes the unit route; headless `exo run [plan]` starts from the user's terminal only.
- On a restart, write one line naming each landed task and the next.
- Only a `Plan-task:` commit shows each landed task, and no memory does.
- `Route: inline` prints `Steps:` and each task's section. Follow them, not steps 4-6, and edit no product code in this session.
- A `Design:` line routes its task per the design tasks reference, then repeat step 3.
- A choice that changes public behavior, data or cost stops the run with a question; rule on any other in the commit.
- The tail (`gate`) stays here, in no runner brief. Only a block, failure or question speaks.
- `LANDED <n> pending mcp:<tool>`: call `mcp__*__<tool>`.
  - When that tool is missing, do not shell it: report `Unverified: <command> (no mcp__*__<tool> in this session)` and no Done.
  - After a failed call, run the bug fixer, rerun, then `land-task.mjs --fix`.
- `BLOCKED <n> NEEDS ANSWER: <question>`: after the wave, ask each question in its own message, no batching, then re-dispatch that task with the answer in its prompt only.
- Any other `BLOCKED` ends the turn with its reason's question and the report path, or hands it unread to a fresh agent.
- `BLOCKED all nested dispatch unavailable` asks to set `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` to 3+ for a launched run, else 2+. Otherwise step 5 uses the direct route reference.
