# Step 5 under `Route: direct`

This session builds each task itself, never through `exo:build-task` and never in a wave worktree.

- A `Next:` line, or each task of a `Wave:` line taken one at a time in plan order, names a `Brief:` file; read it and build the task in the run's checkout.
- Where the brief says test first, or carries a `Risk:`, write one failing test, run it and see it fail before the production edit.
- Run the task's `Proof:` command in the foreground, or its `Run:` lines with no `Proof:`; green is its printed pass.
- Write `<checkout>/.exo/implementer-<n>.md` with the lines `<Proof command>: pass`, then the last output lines of that run indented under it.
- Then run `node "${CLAUDE_SKILL_DIR}/scripts/land-task.mjs" --plan <plan> --task <n> --root <checkout>`, ending in the `Next:` line; loop to step 3.
- A land-task refusal about the report is fixed in the report file, never by rerunning the proof.
- Any other refusal is fixed in the code, then the proof and land-task run once more.
- A second failure of one task stops the run `BLOCKED` with the output and 2-3 options.
