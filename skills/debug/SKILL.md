---
name: debug
description: Prove the cause of a bug, error, crash, regression, broken output, or slowdown before changing production code. Use when existing behavior is reported wrong and evidence does not yet identify one causal line or boundary plus a mechanism that predicts the symptom. Not when a diagnostic names the exact file, line, and invalid symbol or type and matches the source; when the user-stated cause checks out against the code; or when the request is a feature complaint, not a failure of existing behavior.
---

# Debug

Prove the mechanism before fixing it. The enemy is the nearby plausible patch that hides today's symptom without explaining it. The overcorrection is investigating after the evidence already identifies one causal line and predicts the failure. Stop investigating at proof, then implement the smallest predicted change.

**No production edit before a reproduction.** If the symptom cannot be triggered, the current deliverable is reproduction evidence, not a fix.

## Activation gate

Treat the cause as proven only when observed evidence identifies one causal line or boundary and one mechanism that predicts the symptom. A diagnostic naming a file and line is sufficient only when the named source contains the invalid symbol, type, or operation described. Proven cause means skip investigation and fix directly; otherwise run the loop.

## The loop

1. **Reproduce.** Capture a failing test, repeatable command, or specific input. Run it as one bare command and, when its output would exceed the cap, redirect it to `.git/debug-repro.log` and read `tail -n 40` of that log; the same rule holds for every later run in this loop, because a log pasted once is re-read on every later turn. When unavailable infrastructure blocks the original symptom, name the missing dependency and reproduce at the first repository-owned boundary that supplies input to it, without claiming equivalence. After reproduction, apply the test-design row in References before the first affected test or production edit.
2. **Instrument.** Keep two hypotheses not contradicted by the reproduction. Add one observation that produces different outputs for them at their first divergent boundary. Delegate locating that boundary's file and its callers to `codebase-scout` and read here only the ranges it names; a search run here stays in context for every later step.
3. **Isolate.** Remove inputs or branches until removing one more makes the symptom disappear. Use an ephemeral copy when isolation would disturb a shared file. Two instrument-and-isolate rounds that leave both hypotheses standing end the loop: report the reproduction, both hypotheses, and every observation, and stop, because a third round without a discriminating observation is guessing.
4. **Predict, then fix.** Before editing production code, state the causal line, the output that will change, and why. Apply the security and data-migration rows in References to that predicted change, then make only the change required by the prediction.
5. **Prove.** Re-run the original reproduction and isolated case. Run the repository's required suite under the Step 1 output rule, then grep the log for failures instead of printing it. Report the mechanism and the output lines that prove it, at most ten, with the log path for the rest.
6. **Retain project knowledge.** Select root `AGENTS.md` when it exists, otherwise root `CLAUDE.md`. If reproduction or proof reveals a build, test, or run command, or a failure-causing repository gotcha, absent from that selected file, append one line there. If neither file exists, create nothing. Do not record session history.
7. **Fresh eyes.** Skip this step when the caller states that a pull-request review follows: that review is the one fresh look. Otherwise, when one or more size facts are true—more than one changed file, a dependency, a public signature, user-visible behavior, or a required file outside initial inspection—run the `code-review` skill at medium effort on its default target and fix each confirmed correctness finding under Step 5's proof; when that skill is absent, follow `implementing-batch`'s Fresh eyes step: read `../implementing-batch/references/critique.md` now and not earlier, run its checks, and report that no separate context was available.

## Performance branch

A speed-only symptom requires measurement before a hypothesis or edit. Read `../implementing-batch/references/performance.md` after identifying a speed-only complaint and before measuring. Do not load it for correctness failures.

## References

| File | Read it when |
|---|---|
| `../implementing-batch/references/performance.md` | Speed is the only symptom. Load before measurement; do not load for wrong-output failures. |
| `../implementing-batch/references/critique.md` | Step 7 after proof, only when at least one listed size fact is true and `code-review` is absent. Do not load earlier. |
| `../implementing-batch/references/security.md` | After Step 4 identifies the predicted change and before its first affected test or production edit, only when changed behavior crosses authentication/authorization; tenant/resource ownership; secrets/credentials; untrusted input; network, file, or process execution; cryptography; or payments/regulated-data boundaries. Filenames and dependency names alone do not qualify. |
| `../implementing-batch/references/data-migration.md` | After Step 4 identifies the predicted change and before editing, only when the fix changes a database schema, persisted-data or file format, backfill, destructive DDL, persisted-data deletion, or compatibility between concurrently deployed versions. In-memory types, cache rebuilds, and version-only dependency bumps do not qualify. |
| `../implementing-batch/references/test-design.md` | After reproduction and before the first affected test or production edit, only when the symptom changes logic or public behavior and the repository exposes an automated test runner. Style, text, and version-only changes do not qualify. |

## Judgment

- Outside a read-only planning turn, `debug` outranks `shaping`, `planning`, and `implementing-batch` until the cause is proven; at proof `debug` applies the predicted fix itself through Steps 4 to 7 and loads `implementing-batch` only for edits beyond the predicted change. Inside one, `planning` owns the turn and schedules reproduction as its first phase.
- A user-stated cause outranks investigation only after it matches the source and predicts the reproduction.
- Reproduction and instrumentation outrank intuition, including the first hypothesis.
- The turn ends after Step 7; after a compaction notice, re-run the Step 1 reproduction before the next edit, because the command, not memory, says whether the symptom still exists.
