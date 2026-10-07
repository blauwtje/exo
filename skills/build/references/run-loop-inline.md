# Step 5 under `Route: inline`

`next-task.mjs` prints each bullet below under `Steps:` on the inline route, with the skill, plan and checkout filled in.

- This session builds every task itself, in plan order, in the run checkout; it never dispatches `exo:build-task` and never reads the wave worktrees reference.
- Steps 1-3 stand: the workspace reference's answer holds, and only one `start-run.mjs` runs.
- Build each task from its section printed below; never open the plan or this reference.
- Per task, write the failing test from its pasted block, run its `Run:` and expect the stated failure.
- Then write the code from its pasted block, run `Run:` again and expect green.
- Write the next task's files only after land-task commits this one, because it refuses a path outside the task's `Files:`.
- Commit with `node "${CLAUDE_SKILL_DIR}/scripts/land-task.mjs" --plan <plan> --task <n> --root <checkout>`, one commit per task, never a hand-written `git commit`.
- A failed `Run:` or a land-task refusal gets one fix by this session, then goes to `${CLAUDE_SKILL_DIR}/bug-fixer-prompt.md`; a second failure of one task stops the run `BLOCKED` with 2-3 options.
- `Next: none` goes to step 7.
