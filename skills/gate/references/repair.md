# After the fixer returns

This page runs the recheck after `exo:build-task` with `exo-kind: fix-review` returns, so each repair is verified before the branch moves on. It is step 3 of `gate`. The fixer commits each repair, and `gate.mjs --repair` checks and rechecks them and prints the `LOOP` line this page follows. Before every fixer dispatch, record `git -C <checkout> rev-parse HEAD` as `<pre-fix-sha>`.

With `concern=1` or more and `fix=0`, still dispatch: the fixer, not the gate session, writes each concern's failing test, marking it unproven only if it passes. Give each cluster's fixer only its own findings.

0. When the fixer returns with no `fixed=` line (turn cap), append `reported: turn cap` to each finding line it left unmarked, so the probe run does not fail on it. Do not resume or redispatch it, and continue with step 1.
1. In one turn, start both of these so they run side by side. Later steps read all of their output.
   - Run `node "${CLAUDE_SKILL_DIR}/scripts/gate.mjs" --repair --plan <plan path> --root <checkout> --pre-fix-sha <pre-fix-sha> --findings <findings path> --findings-sha256 <hash>` in the background. `<hash>` is the `FINDINGS-SHA` line of the `merge-reviews.mjs` run that wrote the findings file.
   - Run `node "${CLAUDE_SKILL_DIR}/scripts/run-probes.mjs" --report <findings path> --root <checkout>`, which reruns each `fixed` finding's probe.
2. Wait for all of them. End the turn after step 1's message, and let each completion notification resume it.
   - Call no ScheduleWakeup, ListAgents, Monitor or sleep meanwhile.
   - A `FAIL probe` line ends the turn with its report.
3. Follow the `LOOP` line of `gate.mjs --repair`:
   - `next=fix`: append its `FAIL` lines to the findings file, redispatch the fixer per `gate` step 3 with a new `<pre-fix-sha>`, and repeat from step 1.
   - `next=stop`: end the turn with its `STOP` line and the open findings in the report, and dispatch no further.
   - `next=done`: go to step 4.
4. Dispatch `exo:review-branch` with no model override per the `DISPATCH Repair` line, with findings path `<checkout>/.exo/fix-review.md`. Run no `merge-reviews.mjs` on that file.
   - No file at `<checkout>/.exo/fix-review.md` means the one resume in the gate `BLOCKED` and resume rules. If there is still no file, end the turn `BLOCKED` with its report, even when the return line reads `CLEAN`.
   - `FINDINGS` with `fix=0` (only `report` findings) goes to `gate` step 4.
   - `FINDINGS` with `fix=1` or more, or `BLOCKED`, ends the turn with its report.
