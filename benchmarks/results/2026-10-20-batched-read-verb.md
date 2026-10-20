# Batched read verb for the builder

Tested on 2026-10-20 as a $0 offline replay of recorded real-use transcripts. Scripts, prereg and notes are local and untracked in the main checkout under `.exo/self-improve/s6/`.


Script tests/g4-count.mjs (log tests/g4-count.log), ceiling variant tests/g4-ceiling.mjs (join constraint removed). Prereg r2-test-G4-prereg.md, unchanged.
Corpus: real-use run sessions (build script Bash call), `-Users-*`, no sweep. Build-task agents: other projects 960, exo repo 870.

| corpus | build-task $ | bt share of run | removed reqs / total | saving, share of bt cost (95% CI) | of run |
|---|---|---|---|---|---|
| other (primary) | 180.69 | 27.5% | 129 / 14548 | 0.31% (0.23-0.40) | 0.08% |
| exo repo | 159.42 | 6.9% | 170 / 11613 | 0.89% (0.63-1.19) | 0.06% |

Threshold was >= 3.0% of build-task cost (and >= 1.5% of run for the paid arm). Missed by about 10x on the primary corpus.
Sensitivities: without the output-token component 0.13% (other); loose variant (run may absorb the preceding read-only request) 0.44% (0.34-0.55).
Ceiling (every consecutive read-only request run merges, targets need not appear in the brief): other 1.98% (1.75-2.25), 0.54% of run; exo 5.19%, 0.36% of run.
So even the unconstrained upper bound is under 3% on the primary corpus and under 1.5% of run on both. Cause: builders already batch parallel calls, read-only runs after the brief read are short, and a removed request saves only its output plus one cache read of a small (~8k) context.
Verdict: FAIL, reject. No paid arm, no worktree. Ledger suggestion: `batched-read-verb` rej, 0.31% of build-task cost (ceiling 1.98%).
Caveat: "brief" = first Read result of the agent; briefs average ~2k chars, so the Files: join is a faithful but approximate test; the ceiling bound makes it moot.
