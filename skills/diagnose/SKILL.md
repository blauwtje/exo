---
name: diagnose
description: "Finds the proven cause of wrong behavior from a reproduction, then fixes it with a test seen red before green. Use when the user reports a bug, error, crash, regression or slowdown ('why does X fail', 'this broke', 'debug this'). Not for a missing feature or a failing pull request check."
argument-hint: "symptom, failing command or error"
model: opus
effort: medium
---

## Principles

- Prove the cause before changing code, because a fix for a guessed cause hides the bug.
- Proven means a causal line plus a mechanism that predicts the symptom.
- Never revert or stash to show red, and ask before any destructive step, because both can lose work.
- After 3 messages reporting the same breakage, stop changing code and test the likeliest wrong assumption with a command, because repeated fixes on a wrong assumption add noise.

## Steps

1. Read `${CLAUDE_PLUGIN_ROOT}/BASE.md`.
2. Reproduce: find one command that shows the failure. Send long output to `<scratch>/repro.log` and read its `tail -n 40`.
   - No repro: report the evidence and fix nothing.
   - It worked before: run `git bisect run` with the repro on a known good commit. The first bad commit's hunks are the first suspects.
   - It fails only after another test: bisect over the test files, with the failing test last, to find the one that pollutes it.
   - Slowdown: time the reported path five times and record the median and spread, because one run cannot separate a fix from noise.
3. Instrument: keep two hypotheses and observe once where they diverge.
4. Isolate: when a sibling input or code path works, list every difference from the failing one, then remove inputs or branches until one more clears the symptom. Stop after two rounds with no change.
5. When reading alone does not prove the cause, send a fresh `exo:researcher` to investigate. Name in its prompt the symptom, the repro, what is ruled out and the result file `<scratch>/diagnose-<topic>.md`, and read only its cause.
6. Predict, then fix: state the causal line and the output the fix changes, and change only that. Write a test that fails for the cause, and quote its failure before the fix and its pass after. A slowdown fix stays only when the median beats the spread.
7. Prove: rerun the repro, the isolated case and the suite. A fix that must change a second module goes back to step 2. An intermittent repro counts as fixed after five green runs in a row.
8. When the fix changes over two files, adds a dependency, changes a public signature or crosses a persisted format or security boundary, run `code-review` at level `low` and fix its findings.
9. Report the cause, whether the fix is proven and the next step, usually `exo:ship`, labelling each claim measured, inferred or guess. When unproven, give the repro, expected, actual and hypotheses.
