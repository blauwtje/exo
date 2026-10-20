# Builder lands its own task

Tested on 2026-10-20 as a $0 offline replay of recorded real-use transcripts. Scripts, prereg and notes are local and untracked in the main checkout under `.exo/self-improve/s9/` (r6-test-R1.md, prereg r6-test-R1-prereg.md; script tests/R1/R1.mjs).

Idea: the build-task builder runs the landing itself, so the run-unit spends no land turn and no readback turn.

Verdict: FAIL on the quality guard ($0 census, no branch). 34 genuine land refusals ("land-task: ..." or Land gate failed) follow a green builder `--check` of the same task; the prereg required 0.

## Evidence
- Corpus: real-use run-units after 2026-10-09 (no tmp, no fixtures): 266 units, 217 sessions. First-pass refusals after a green builder check: 34 of 267 run-unit land calls (233 landed).
- Landing catches what the builder check does not: Land gate, red-proof and Data: checks.
- Side number: run-unit land plus readback requests are 14.9% of run-unit cost, CI [11.8%, 17.6%] (price-table estimate $65.4 total). The upper bound clears 3%, but the guard stops the idea.

## Caveats
- The refusal regex is loose and a builder `--check` match is by task number only; even a 10x overcount leaves more than 0.
