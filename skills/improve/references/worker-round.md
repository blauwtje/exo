# Worker round

A `mode=worker` round is two tool calls; every step reads only the worker's return line and `round.mjs` output.

1. Dispatch one `general-purpose` delegate whose prompt opens with `exo-kind: improve-round`, then `Follow <brief>.` with `brief` from the settled line, and the settled model and effort. The prompt is the same every round; `round.mjs` rewrites the brief.
2. `IDEA <hash>` → run `node "${CLAUDE_SKILL_DIR}/scripts/round.mjs" --root <root> --tag <tag> --commit <hash>`, in the background when `limit` > 500; its output `ROW <hash> <score> <status> best=<score>` ends the round, then step 1.
3. `NO-IDEA <reason>` → step 1 again; `noidea` of them in a row, from the settled line → Stop, naming the last reason.
4. `STOP <reason> <detail>` (`scorer-changed`, `reset-failed <hash>`, `no-keep 10`) → Stop, naming both.
5. Crash row → next round as usual; its idea may be retried with the cause fixed.

## Stop

- Trigger → the user interrupts, a stall, a `STOP` line, an inline lead with no idea left, or `noidea` `NO-IDEA` returns in a row.
- Report the best kept score against the baseline, the branch, the worktree, and the trigger when it was not the user.
- Leave the branch, the worktree and every `.exo/improve/` file in place.
