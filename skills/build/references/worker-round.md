# Worker round

Goal: run each round as two tool calls, reading only the worker's return line and the `round.mjs` output.

1. Dispatch one `general-purpose` delegate whose prompt opens with `exo-kind: improve-round`, then `Follow <brief>.`, then `Reads: <brief>` and `Worktree: <abs path>` on lines of their own, with `brief` from the settled line, and the settled model and effort. The prompt is the same every round, because `round.mjs` rewrites the brief.
2. On `IDEA <hash>`, run `node "${CLAUDE_SKILL_DIR}/scripts/round.mjs" --root <root> --tag <tag> --commit <hash>`. Run it in the background when `limit` × `defaults.improve.maxRuns` > 500, since a noisy score reruns; its output `ROW <hash> <score> <status> best=<score>` ends the round and step 1 starts the next.
3. On `NO-IDEA <reason>`, repeat step 1. After `noidea` of them in a row, from the settled line, Stop and name the last reason.
4. On `STOP <reason> <detail>` (`scorer-changed`, `reset-failed <hash>`, `no-keep 10`), Stop and name both.

## Stop

- A trigger is the user interrupting, a stall, a `STOP` line, an inline lead with no idea left, or `noidea` `NO-IDEA` returns in a row.
- Run `node "${CLAUDE_SKILL_DIR}/scripts/round.mjs" --root <root> --tag <tag> --report`. Its `HOLDOUT` line holds the held-out cases' best kept mean against the baseline, or `HOLDOUT none` when setup held none out.
- Report the best kept score against the baseline, the `HOLDOUT` line, the branch, the worktree, and the trigger when it was not the user.
- Leave the branch, the worktree and every `.exo/improve/` file in place.
