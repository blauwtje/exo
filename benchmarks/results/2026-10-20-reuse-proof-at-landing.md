# Reuse the build's passing Proof run at landing

Tested on 2026-10-20 as a $0 offline replay of recorded real-use transcripts. Scripts, prereg and notes are local and untracked in the main checkout under `.exo/self-improve/s9/` (r6-test-K1.md, prereg r6-test-K1-prereg.md; script tests/L2/K1.mjs).

Idea: `land-task.mjs --check` records the builder's passing Proof so landing skips its rerun.

Verdict: FAIL ($0 spent, no paid run, no branch). Saving 0.45% of run-unit wall, bootstrap 95% CI [0.20%, 0.67%], against a 3% lower-bound bar. The Proof is 3.9% of land-task time (CI 2.2-5.2%); the side condition was at least 33%.

## Evidence
- Corpus: real-use run-units after 2026-10-09 (no /private/tmp, no fixture projects): 266 units, 217 sessions, 202 landings with Committed output, 69 with a valid prior builder Proof run (after the builder's last edit, same parent run-unit).
- Run-unit wall 84,141 s; plain land-task time 9,814 s (11.7% of wall); skipping the Proof rerun saves 380 s.
- Upper bound: if all 202 landings had a valid prior Proof, the saving is about 1,110 s = 1.3% of wall, still under 3%. The miss is not a coverage artifact.
- Cause: the 14 s median land-task is lint, code rules, Land gate and git, not the Proof rerun. The 69-120 s gate runs of the 2026-10-10 baseline are Land gate runs, not Proof reruns, so the deferred row's retry condition is not met. The Land gate is already cached by tree key.
- Side column (drop the plugin-version check from the per-task gate): 0.67% of run-unit wall, under the bar; the refusal regex is loose, so read it as an upper-ish estimate.

## Caveats
- Proof duration is proxied by the builder's own run of the same command (tool_use to tool_result); landing reruns could differ slightly.
