# build-task stops at green plus report

Tested on 2026-10-20 as a $0 offline replay of recorded real-use transcripts. Scripts, prereg and notes are local and untracked in the main checkout under `.exo/self-improve/s6/`.

Verdict: FAIL (offline, $0). Paid spend: $0 of $4.75. No branch, no worktree.
Prereg: r1-test-F3-prereg.md (written before any outcome data). Script: tests/f3-tail.mjs (rows in r1-test-F3.rows.json), tests/f3-sample.mjs (command sample).

## Measured (real-use = non-exo-sweep, 2,919 build-task transcripts, $450 total; 2,320 have a green own-Proof run)
- Tail after first green Proof = 33.3% of build-task cost (REQUIRED land-check/report/diff share 12.8%).
- Avoidable (REVERIFY + POLISH) = 13.37% of build-task cost, bootstrap 95% CI [12.52, 14.26] (reverify 6.89%, polish 6.48%). User projects 13.54%, other 12.24%. Sweep: 0.83% [0.59, 1.09].
- FIX (edit after green, or a rerun after an edit or red run) = 21.2% of the tail cost, CI [19.7, 22.7]; 25.6% of green tasks have a FIX tail.
- Cost effect alone would pass the 3% bar (lower bound 12.5% >> 3%).

## Why it fails the prereg
1. Criterion "FIX under 20% of the tail": point estimate 21.2%, CI straddles 20 (fails on the point estimate).
2. Quality guard: 25.6% of tasks edit after the first green (>5% exposure). A blunt "stop at first green Proof" would drop those edits: land-task --check refusals fixed after the Proof, lean cleanups (sed -i comment removal seen in sample), test-first follow-up edits. That is the missed-hidden-test / unfinished-work risk the guard exists to catch.
3. Already implemented: agents/build-task.md `## Stop` (since f5b9c411, 2026-09-25, and every transcript in the corpus is newer) already says "Stop at green, a second test or Run: failure, or an open user choice." The 13.4% avoidable tail occurs under that rule, so adding the line to implementer-prompt.md would restate it. The knob that is left is compliance, not a missing rule; gate text said "only a stop rule changes it", which this refutes.

## Caveats
Classifier is heuristic (regex on commands; "green" = first Proof command with no failure marker, so a green before the real end of a multi-step task counts the rest as tail). POLISH may include reads feeding the report. Even loosening these, the FIX/guard result and the existing rule stand. Paid A/B not run (prereg stop rule: offline FAIL means no paid run).

## Retry hint (not tested)
A narrower rule, "after green, run only land-task --check and write the report; no sed -i/cleanup edits, no Proof rerun unless land-task refused", would target REVERIFY+POLISH (13.4%) while keeping the fix-on-refusal path; it needs its own prereg since the existing Stop line did not hold it.
