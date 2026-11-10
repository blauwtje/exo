# The direct route: the fallback when nested dispatch is unavailable

- Step 3 runs `next-task.mjs` without `--block`, for its `Next:` or `Wave:` line.
- `GREEN` names a diff path, which this session reads only as `git apply --stat <diff path>` before it runs `node "${CLAUDE_SKILL_DIR}/scripts/land-task.mjs" --plan <plan> --task <n> --root <checkout>`, a wave's per the wave worktrees reference's step 3. The report and the full diff stay unread.
- land-task ends in `Next: none` or a `Then:` line. The `Then:` line dispatches nothing, so step 3 reruns `next-task.mjs` for the next `Next:` or `Wave:` line.
- A `Next:` line sends its task, and a `Wave:` line sends each task per the wave worktrees reference in one message, to `exo:build-task` from `../implementer-prompt.md`, which carries `Return: one line`.
- `Task <n>: BLOCKED NEEDS ANSWER: <question>` follows the loop's step 6.
- In a wave, a failed sibling leaves a green task landed.
- That reference's step 4 saves each worktree's diff, then removes it.
- A build report held as text and not on disk lands by piping its full text to `land-task.mjs --report -`, which refuses no file as missing.
- Land-task refusal about the report's content (no Proof command, a command listed as failing): dispatch a fresh `exo:build-task` from `../implementer-prompt.md` with land-task's full refusal added verbatim. This session reruns no proof to repair a report.
- Off-brief build-task return: SendMessage it once, per `${CLAUDE_PLUGIN_ROOT}/hooks/session-rules.md`. A second one gets a fresh `exo:build-task` as above.
- Build-task stopped at its turn limit before green: redispatch `exo:build-task` from `../implementer-prompt.md`, not an improvised prompt to another agent.
- `PLAN DRIFT` follows its printed `Then:` line from next-task or land-task. The `plan drift` line hands the report path, unread, to `../drift-repairer-prompt.md`, and the `input unreachable` line stops the run `BLOCKED` with that path and no repair delegate.
- Build return `BLOCKED input unreadable: <path>` stops the run `BLOCKED` with that path and no repair delegate, because no repair session can supply the input.
- Any other land-task refusal reads the full diff. Any other line hands its report path, unread, to a repair delegate: `BLOCKED` or a failed `Run:` with no cause goes to `../bug-fixer-prompt.md`.
- A second failure of one task stops the run `BLOCKED` with both reports and 2-3 options.
- A land-task refusal other than `PLAN DRIFT` or a report refusal goes to a repair delegate the same way and reruns once. A second refusal stops likewise.
