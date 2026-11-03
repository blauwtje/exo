# The loop, steps 1-6

1. **Find the plan, then settle the workspace.** Run `node "${CLAUDE_SKILL_DIR}/scripts/start-run.mjs" --find-only`, plus `--plan <path>` for a named plan.
   - When the request or caller names the workspace, skip `--find-only` and run `start-run.mjs --checkout <checkout>` once, same `--plan`.
   - Zero or several matches: ask which plan.
   - Every session takes the unit route below. Headless `exo run [plan]` starts only from the user's terminal and refuses inside a session.
   - Settle where the run commits: take `Repository:` and `Branch:` from that output, not the plan.
   - Rerun `start-run.mjs --plan <path> --checkout <checkout>` once; `run started` ends step 1.
   - Invoking build authorizes commits there and a wave's worktrees; a push or pull request waits for the user's `ship` answer, except `--land`, which `ship` takes.
2. **Leave the plan to the unit,** which reads the frame sections; the whole plan stays unread here.
3. **Ask the branch what landed.** Run `node "${CLAUDE_SKILL_DIR}/scripts/next-task.mjs" --block --plan <plan> --root <checkout>`. `Next: none` goes to step 7.
   - A `Plan:` line in the `run started` output is this step's first output; skip this call once.
   - `Route: inline` prints `Steps:` and each task's section. Follow them, not steps 4-6.
   - Only a `Plan-task:` commit shows what landed.
   - On a restart, write one line in the reply language naming landed tasks and the next. Later loops stay silent.
4. **Take the block from the `Block:` line.**
   - A `Design:` line routes its task per the design tasks reference, then repeat step 3.
   - An open choice the user would miss stops the run with a question. Rule on any other and record it in the commit.
5. **Dispatch the unit.** Send the `Block:` tasks to `exo:task-runner`, silently, then end the turn; its notification resumes it.
   - Name plan path, branch, checkout, task numbers.
   - Build no task here and call no ScheduleWakeup, ListAgents, Monitor or sleep meanwhile.
6. **Route the return.** Each line is `LANDED <n>` or `BLOCKED <n> <reason> <report path>`.
   - `LANDED` needs nothing bar a ` pending mcp:<tool>` suffix: call `mcp__*__<tool>`.
   - When that tool is missing, do not shell it: report `Unverified: <command> (no mcp__*__<tool> in this session)` and no Done.
   - After a failed call, run the bug fixer, rerun, then `land-task.mjs --fix`.
   - `BLOCKED <n> NEEDS ANSWER: <question>`: after the wave, ask each question in its own message, then re-dispatch that task with the answer in its prompt only.
   - Any other `BLOCKED` ends the turn with its reason's question and the report path, or hands it unread to a fresh agent.
   - `BLOCKED all nested dispatch unavailable` asks to set `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` to 2+. Otherwise step 5 uses the direct route reference.
   - This session edits no product code or plan during a build and follows each `Then:` line. Loop to step 3; only a block, failure or question earns a message.
