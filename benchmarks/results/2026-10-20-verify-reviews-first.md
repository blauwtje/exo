# Start reviews without waiting for the gate

Checked on 2026-10-20 as a $0 census of recorded real-use transcripts. Scripts, prereg and notes are local and untracked in the main checkout under `.exo/self-improve/s9/` (r6-test-K4.md, prereg r6-test-K4-prereg.md).

Idea (round 6, L1.3): dispatch the branch review while `verify.mjs` runs, instead of waiting for the gate.

Verdict: already landed in commit 779e1294 "perf(verify): start reviews without waiting for the gate" (2026-10-10). Nothing left to save; $0 spent, no branch.

## Evidence
- `skills/verify/SKILL.md` step 1 runs `verify.mjs --reviews-only` (foreground, about 0.6 s), then in one message the full run in the background and step 2's dispatch.
- The L1.3 baseline (54 foreground gate calls, 1,291 s, 23.9 s mean) predates the change.
- Census of real-use transcripts after 2026-10-10: 25 `verify.mjs --plan` calls in 14 sessions. 11 were foreground full gates (sum 778 s, p50 70 s, max 120 s, all dated 10-10 before or around the change), 14 were background, and 1 was a foreground `--reviews-only` call (0.6 s). The post-change sample is far under any floor.
- Gate FAIL rate in the 11 foreground calls: 1 of 11 (9%), under the 25% guard, but moot.
- The 23.9 s mean of L1.3 against the 70 s here mixes plan sizes and is not used for the verdict.
