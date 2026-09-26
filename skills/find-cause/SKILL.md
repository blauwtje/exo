---
name: find-cause
description: Use when existing behavior is reported wrong (bug, error, crash, regression, broken output, slowdown) and no evidence yet shows one causal line plus a mechanism predicting the symptom. Not when a diagnostic's file, line and symbol match the source, when the stated cause checks out, or for a feature complaint.
argument-hint: <symptom, failing command or error>
---
# Debug

## Phases

The session runs these phases and Step 7; a delegate dispatches nothing. Until the cause is proven this skill outranks `define-scope` and `build-change`; a read-only planning turn writes the plan per `../define-scope/references/task-list.md`, reproduction test as Task 1. Before the first dispatch run `node "${CLAUDE_SKILL_DIR}/../../lib/scratch-exclude.mjs"`.

a. **Locate.** When the symptom names no file or symbol, dispatch `exo:locate-code`.
b. **Investigate.** A cause is proven only when observed evidence names one causal line and a mechanism predicting the symptom; a diagnostic or a user-stated cause counts only when the source holds what it describes. Proven: write the handoff's investigate part, `Status: proven`. Otherwise dispatch a `general-purpose` delegate on `opus` from `investigator-prompt.md`.
c. **Fix.** Settle where the fix commits per `../run-plan/references/workspace.md`, because a delegate cannot ask; for another checkout, copy the handoff into its `.exo/debug/`. Dispatch a `general-purpose` delegate on `sonnet` from `fixer-prompt.md`; on `failed`, resume it with SendMessage, because its transcript holds the attempts.
d. **Report.** Read only the status lines and the handoff fields the Report line names, never its `Log` or `Ranges` paths. After a compaction, re-run the handoff's `Repro` before dispatching, because memory cannot say the symptom persists.

## The loop

1. **Reproduce.** Capture a failing test, command or input as one command; with no trigger, deliver evidence, not a production edit. Send long output to `<scratch>/debug-repro.log`, `<scratch>` being what `node "${CLAUDE_SKILL_DIR}/../../lib/scratch-path.mjs" debug` prints, and read it with `tail -n 40`, because a pasted log rides in every later turn. When missing infrastructure blocks it, reproduce at the first repository-owned boundary feeding it, claiming no equivalence.
2. **Instrument.** Keep two hypotheses the reproduction leaves standing and add one observation that separates them at their first divergent boundary.
3. **Isolate.** Remove inputs or branches until one more removal makes the symptom vanish, copying any shared file. Two rounds leaving both hypotheses standing end the loop, because a third round is guessing.
4. **Predict, then fix.** Before any production edit, state the causal line, the output that will change, and why; then make only the change the prediction requires.
5. **Prove.** Re-run the reproduction, the isolated case and the required suite under Step 1's output rule; a skipped run proves nothing. Return to Step 1 instead of patching when the repair reaches a second owner, an old route and its replacement both run, or supporting code grows while behavior stays the same, because the cause was wrong.
6. **Retain project knowledge.** Follow `../build-change/references/project-knowledge.md`.
7. **Fresh eyes.** Unless the caller says a pull-request review follows, run `node "${CLAUDE_SKILL_DIR}/../../lib/size-facts.mjs"`; when it prints `changed files` above 2 or `dependency-added yes`, or the fix crosses a public signature, persisted format or security boundary, run `code-review` at the effort `node "${CLAUDE_SKILL_DIR}/../run-plan/scripts/pick-reviewer.mjs" --effort` prints (`skip`, `low` or `medium`), `low` for `skip`. Fix each confirmed correctness finding under Step 5's proof. Then commit the `Tests` files alone as `test(<scope>): reproduce <symptom>`, then the fix, because a test committed with its fix never shows it failed. Edits beyond the prediction end the turn on `node "${CLAUDE_SKILL_DIR}/../route-skills/scripts/next-stage.mjs" --after find-cause --artifact none`'s output; otherwise it ends on `ship`.

## References

| File | Read it when |
|---|---|
| `references/handoff.md` | Writing or reading a handoff. |
| `../run-plan/references/workspace.md` | Phase (c), before any edit. |
| `investigator-prompt.md` | Phase (b). |
| `fixer-prompt.md` | Phase (c). |
| `../build-change/references/performance.md` | Speed is the only symptom. |
| `references/profiling.md` | A slowdown, memory growth, or a profile or trace. |
| `../build-change/references/critique.md` | Step 7, when `code-review` is absent. |
| `../build-change/references/security.md` | When its first line applies. |
| `../build-change/references/data-migration.md` | When its first line applies. |
| `../build-change/references/test-design.md` | When its first line applies. |
| `../build-change/references/project-knowledge.md` | Step 6. |

Report: the mechanism, at most ten proof lines and the log path, and the test and fix SHAs; unproven, the `Repro`, `Expected`, `Actual` and `Hypotheses`.
