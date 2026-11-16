---
name: diagnose
description: "Finds the proven cause of wrong behavior from a reproduction, then fixes it with a test seen red before green. Use when the user reports a bug, error, crash, regression or slowdown ('why does X fail', 'this broke', 'debug this'). Not for a missing feature or a failing pull request check."
argument-hint: <symptom, failing command or error>
model: opus
effort: medium
---
# Diagnose

Prove the cause before changing code, because a fix for a guessed cause hides the bug. Until then this skill comes before `exo:spec` and `exo:build`; in plan mode, write the plan in `exo:spec`'s format with the reproduction test as Task 1.

## Steps

1. **Reproduce.** Read an existing log or `.exo/` report, then find one command that shows the failure. Send long output to `<debug-dir>/repro.log`, where `node "${CLAUDE_PLUGIN_ROOT}/lib/scratch-path.mjs" debug` prints `<debug-dir>`, and read its `tail -n 40`. No repro: report the evidence and fix nothing. Ask the user only when the symptom itself is unclear.
   - It worked before: `node "${CLAUDE_SKILL_DIR}/scripts/bisect.mjs" --repro "<command>"` prints the first bad commit; its hunks are the first suspects.
   - Slowdown: time the reported path five times and record the median and spread first. A captured profile is fixed data: load it, do not re-run, and name the hot frame's file, symbol and line.
2. **Instrument.** Keep two hypotheses and observe once where they diverge.
3. **Isolate.** Remove inputs or branches until one more clears the symptom; two rounds with no change end it. Proven means a causal line plus a mechanism that predicts the symptom.
4. **Predict, then fix.** State the causal line and the output the fix changes, and change only that. Before you edit code yourself, read the code rules that the first bullet of `${CLAUDE_PLUGIN_ROOT}/agents/builder.md` names. Write a test that fails for the cause and quote its failure before the fix, its pass after. Never revert or stash to show red. Ask the user before any destructive step. A slowdown fix stays only when the median improves by more than the spread.
5. **Prove.** Rerun the repro, the isolated case and the suite. A fix that must change a second module, beyond the one holding the cause, goes back to step 1.
6. **Review.** When the fix changed more than two files, added a dependency, or crosses a public signature, persisted format or security boundary, run `code-review` at level `low` and fix its findings under step 5.

## Delegating

When reading alone does not prove the cause, send a fresh `exo:builder` `investigator-prompt.md` (Steps 1 to 3). Once its handoff says `Status: proven`, settle where the fix commits as step 1 of `exo:build` does, say where, then send a fresh `exo:builder` `fixer-prompt.md` (Steps 4 and 5). On `failed`, send one more fresh `exo:builder` the same prompt with the failed handoff path, once. After `status=fixed`, run the handoff's Repro command yourself as the verdict. Commit the new test alone, then the fix. Read only their status lines and handoff fields.

## Report

Invoked by another stage: return without asking. Else state the cause in plain words, whether the fix is proven, and the user's next step, usually `exo:ship`; label each claim measured, inferred or guess. Unproven: `Repro`, `Expected`, `Actual` and `Hypotheses`. Proof lines and commit hashes stay in the handoff.
