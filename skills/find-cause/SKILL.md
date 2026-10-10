---
name: find-cause
description: Use when behavior is reported wrong (bug, error, crash, regression, slowdown) and no evidence shows the causal line and its mechanism. Not when a diagnostic's file, line and symbol match the source, the stated cause holds, or for a feature complaint.
argument-hint: <symptom, failing command or error>
---
# Find cause

a. **Locate.** Until the cause is proven this skill outranks `spec` and `build`; a read-only planning turn writes the plan per `../spec/references/task-list.md`, reproduction test as Task 1. Run `node "${CLAUDE_SKILL_DIR}/../../lib/scratch-exclude.mjs"`; no symbol: `exo:locate-code`.
b. **Investigate.** Proven needs a causal line and a mechanism predicting it or holding in the source: write `Status: proven`; else dispatch `exo:solve-hard` from `investigator-prompt.md`.
c. **Fix.** Settle where it commits per `../build/references/workspace.md`, else copy the handoff to `.exo/debug/`. Dispatch `general-purpose` on `sonnet` from `fixer-prompt.md`; resume `failed` via SendMessage.
d. **Report.** Read only status lines and Report fields. After compaction, re-run `Repro`.

1. **Reproduce.** Read an existing log, profile or `.exo/` report on the path first. One command reproduces it, else evidence, no fix.
   - Send long output to `<scratch>/debug-repro.log`, `<scratch>` from `node "${CLAUDE_SKILL_DIR}/../../lib/scratch-path.mjs" debug`; read with `tail -n 40`.
   - Steps 1-5 → read `references/loop.md` first.
2. **Instrument.**
3. **Isolate.**
4. **Predict, then fix.**
5. **Prove.**
6. **Retain project knowledge.** Per the table.
7. **Fresh eyes.** No PR review: run `node "${CLAUDE_SKILL_DIR}/../../lib/size-facts.mjs"`; when it prints `changed files` above 2 or `dependency-added yes`, or the fix crosses a public signature, persisted format or security boundary, run `code-review` at `node "${CLAUDE_SKILL_DIR}/../verify/scripts/pick-reviewer.mjs" --effort`'s level (`skip`, `low` or `medium`); fix under Step 5. End on `node "${CLAUDE_SKILL_DIR}/../route-skills/scripts/next-stage.mjs" --after find-cause --artifact none`'s output when edits to build remain; else end on `ship`.
   - Invoked by a stage or workflow: ask nothing, return to caller.

## References

| File | Read it when |
|---|---|
| `references/handoff.md` | b, c |
| `../build/references/workspace.md` | c |
| `investigator-prompt.md` | b |
| `fixer-prompt.md` | c |
| `../build/references/performance.md` | Speed |
| `references/loop.md` | 1-5 |
| `references/profiling.md` | Trace |
| `../build/references/critique.md` | No review |
| `../build/references/security.md` | When its first line applies. |
| `../build/references/data-migration.md` | When its first line applies. |
| `../build/references/test-design.md` | When its first line applies. |
| `../build/references/project-knowledge.md` | 6 |

Report: mechanism, up to ten proof lines, log path, test and fix SHAs; unproven: `Repro`, `Expected`, `Actual`, `Hypotheses`.
