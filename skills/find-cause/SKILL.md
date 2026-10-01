---
name: find-cause
description: Use when existing behavior is reported wrong (bug, error, crash, regression, broken output, slowdown) and no evidence yet shows one causal line plus a mechanism predicting the symptom. Not when a diagnostic's file, line and symbol match the source, when the stated cause checks out, or for a feature complaint.
argument-hint: <symptom, failing command or error>
---
# Debug

a. **Locate.** Until the cause is proven this skill outranks `spec` and `build`; a read-only planning turn writes the plan per `../spec/references/task-list.md`, reproduction test as Task 1. Run `node "${CLAUDE_SKILL_DIR}/../../lib/scratch-exclude.mjs"`; no symbol: dispatch `exo:locate-code`.
b. **Investigate.** Proven needs a causal line and a mechanism predicting it; else it must hold in the source. Write `Status: proven`; else dispatch the `exo:solve-hard` agent from `investigator-prompt.md`.
c. **Fix.** Settle where it commits per `../build/references/workspace.md`; else copy the handoff to `.exo/debug/`. Dispatch `general-purpose` on `sonnet` from `fixer-prompt.md`; resume `failed` via SendMessage.
d. **Report.** Read only the status lines and Report's fields, not `Log` or `Ranges`. After compaction, re-run `Repro`.

1. **Reproduce.** One command reproduces it; else deliver evidence, no fix. Send long output to `<scratch>/debug-repro.log`, `<scratch>` from `node "${CLAUDE_SKILL_DIR}/../../lib/scratch-path.mjs" debug`; read with `tail -n 40`. Missing infrastructure: reproduce at the first owning function below it, unstubbed; no sign-off.
2. **Instrument.** Keep two hypotheses; add one observation at their first divergent boundary.
3. **Isolate.** Remove inputs or branches until one more removal clears the symptom; two rounds standing end it.
4. **Predict, then fix.** State the causal line, changed output and why; change only that; drop earlier patches.
5. **Prove.** Re-run the reproduction, isolated case and required suite per Step 1. Return to Step 1 when the repair reaches a second owner or the path resists one reading.
6. **Retain project knowledge.** Per `../build/references/project-knowledge.md`.
7. **Fresh eyes.** No PR review: run `node "${CLAUDE_SKILL_DIR}/../../lib/size-facts.mjs"`; when it prints `changed files` above 2 or `dependency-added yes`, or the fix crosses a public signature, persisted format or security boundary, run `code-review` at what `node "${CLAUDE_SKILL_DIR}/../verify/scripts/pick-reviewer.mjs" --effort` gives (`skip`, `low` or `medium`); fix under Step 5. End on `node "${CLAUDE_SKILL_DIR}/../route-skills/scripts/next-stage.mjs" --after find-cause --artifact none`'s output; else end on `ship`.

## References

| File | Read it when |
|---|---|
| `references/handoff.md` | D1 |
| `../build/references/workspace.md` | c |
| `investigator-prompt.md` | b |
| `fixer-prompt.md` | c |
| `../build/references/performance.md` | Speed |
| `references/profiling.md` | Trace |
| `../build/references/critique.md` | No review |
| `../build/references/security.md` | When its first line applies. |
| `../build/references/data-migration.md` | When its first line applies. |
| `../build/references/test-design.md` | When its first line applies. |
| `../build/references/project-knowledge.md` | 6 |

Report: the mechanism, up to ten proof lines, log path, test and fix SHAs; unproven: `Repro`, `Expected`, `Actual`, `Hypotheses`.
