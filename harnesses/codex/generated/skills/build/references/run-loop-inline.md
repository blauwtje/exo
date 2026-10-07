# Step 5 under `Route: inline`

- This session builds every task itself, in plan order, in the run checkout; it never dispatches `exo-build-task` and never reads the wave worktrees reference.
- Steps 1-3 stand: the workspace answer from `references/workspace.md` holds, and only one `start-run.mjs` runs with the session marker.
- The `Inline:` line names every unlanded task, each with its `Brief:` file; read a task's brief, never the plan.
- Per task, write the failing test from its pasted block, run its `Run:` and expect the stated failure.
- Then write the code from its pasted block, run `Run:` again and expect green.
- Commit with `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/skills/build/scripts/land-task.mjs" --plan <plan> --task <n> --root <checkout>`, one commit per task, never a hand-written `git commit`.
- A failed `Run:` or a land-task refusal gets one fix by this session, then goes to `../bug-fixer-prompt.md`; a second failure of one task stops the run `BLOCKED` with 2-3 options.
- `Next: none` goes to step 7.
