# Step 5 under `Route: inline`

`next-task.mjs` prints each bullet below under `Steps:` on the inline route, with the skill, plan and checkout filled in.

- This session builds every task itself, in plan order, in the run checkout. It dispatches no `exo:build-task` and skips the wave worktrees reference.
- Steps 1-3 stand: the workspace reference's answer holds, and only one `start-run.mjs` runs.
- Build each task from its section printed below, without opening the plan or this reference.
- Per task, write the failing test from its pasted block, run its `Run:` and expect the stated failure.
- Then write the code from its pasted block, run `Run:` again and expect green.
- Commit with `node "${CLAUDE_SKILL_DIR}/scripts/land-task.mjs" --plan <plan> --task <n> --root <checkout>`, one commit per task, not a hand-written `git commit`.
- A failed `Run:` or a land-task refusal gets one fix by this session, then goes to `${CLAUDE_SKILL_DIR}/bug-fixer-prompt.md`. A second failure ends as the direct route does.
- After a `Then:` line from a landing, rerun `next-task.mjs` for the next task's `Steps:`.
- On `Next: none`, run `node "${CLAUDE_SKILL_DIR}/../gate/scripts/verify.mjs" --plan <plan> --root <checkout>` once, in the background, to a log; read only its `PASS` and `FAIL` lines.
- With only `PASS` lines and no `--land` in the request, finish as `gate` steps 3 and 4 do, with this output standing for its step 2.
- On a `FAIL` line, or `--land` in the request, do the loop's step 7 as written: its tail reference, then `gate`, with this output standing for its step 2.
