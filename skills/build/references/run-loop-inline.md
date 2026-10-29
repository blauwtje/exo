# Step 5 under `Route: inline`

`next-task.mjs` prints each bullet below under `Steps:` on the inline route, with the skill, plan and checkout filled in.

- This session builds every task itself, in plan order, in the run checkout; it never dispatches `exo:build-task` and never reads the wave worktrees reference.
- Steps 1-3 stand: the workspace reference's answer holds, and only one `start-run.mjs` runs.
- Build each task from its section printed below; never open the plan or this reference.
- Per task, write the failing test from its pasted block, run its `Run:` and expect the stated failure.
- Then write the code from its pasted block, run `Run:` again and expect green.
- Commit with `node "${CLAUDE_SKILL_DIR}/scripts/land-task.mjs" --plan <plan> --task <n> --root <checkout>`, one commit per task, never a hand-written `git commit`.
- A failed `Run:` or a land-task refusal gets one fix by this session, then goes to `${CLAUDE_SKILL_DIR}/bug-fixer-prompt.md`; a second failure of one task stops the run `BLOCKED` with 2-3 options.
- `Then:` line after a landing → rerun `next-task.mjs` for the next task's `Steps:`.
- `Next: none` → run `node "${CLAUDE_SKILL_DIR}/../gate/scripts/gate.mjs" --plan <plan> --root <checkout> --base <base>` once; load no `Skill exo:gate` and read no tail reference unless the output asks for them.
- Clean output = only `PASS`, `DONE`, `REPORT`, `MANUAL`, `Proof:`, `REVIEW ... none`, `OVERLAP none` and `SKIP` lines; a `SKIP` with `(out of scope` or `Proof: not a single` is not clean.
- Clean output → finish as `gate` step 4 does: end on `ship`, whose three lines name the `REPORT` path as the pointer and omit `Proof:` and `MANUAL` lines.
- Clean output and a request that rules out a push → skip `ship`, give the same three lines, say nothing left the machine.
- Any other line, or `--land` in the request → do the loop's step 7 as written: its tail reference, then `gate`, this output standing for the gate run.
