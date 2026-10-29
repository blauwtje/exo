# After the fixer returns

Step 3 of `gate`, after `exo:fix-review` returns. The fixer commits each repair; `gate.mjs --repair` checks and rechecks them and prints the `LOOP` line this file follows. Record `git -C <checkout> rev-parse HEAD` as `<pre-fix-sha>` before every fixer dispatch.

0. Fixer return with no `fixed=` line (turn cap) → append `reported: turn cap` to each finding line it left unmarked, so the probe run does not fail on it; no resume, no redispatch; continue with step 1.
1. In one turn start both, so they run side by side; later steps read all of their output:
   - `node "${CLAUDE_SKILL_DIR}/scripts/gate.mjs" --repair --plan <plan path> --root <checkout> --pre-fix-sha <pre-fix-sha> --findings <findings path> --findings-sha256 <hash>`, `<hash>` the `FINDINGS-SHA` line of the `merge-reviews.mjs` run that wrote the findings file, in the background.
   - `node "${CLAUDE_SKILL_DIR}/scripts/run-probes.mjs" --report <findings path> --root <checkout>` (reruns each `fixed` finding's probe).
2. Wait for all of them: end the turn after step 1's message; each completion notification resumes it; call no ScheduleWakeup, ListAgents, Monitor or sleep meanwhile. A `FAIL probe` line ends the turn with its report.
3. Follow the `LOOP` line of `gate.mjs --repair`:
   - `next=fix` → append its `FAIL` lines to the findings file, redispatch the fixer per `gate` step 3 with a new `<pre-fix-sha>`, repeat from step 1.
   - `next=stop` → end the turn with its `STOP` line and the open findings in the report; no further dispatch.
   - `next=done` → step 4.
4. Dispatch `exo:review-branch` with no model override per the `DISPATCH Repair` line, findings path `<checkout>/.exo/fix-review.md`; run no `merge-reviews.mjs` on that file.
   - No file at `<checkout>/.exo/fix-review.md` → the one resume in the `## Dispatch` rules that gate's step 2 names. Still no file → end the turn `BLOCKED` with its report, even when the return line reads `CLEAN`.
   - `FINDINGS` with `fix=0` (only `report` findings) → `gate` step 4.
   - `FINDINGS` with `fix=1` or more, or `BLOCKED` → end the turn with its report.
