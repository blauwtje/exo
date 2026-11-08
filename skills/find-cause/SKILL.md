---
name: find-cause
description: Use when reported wrong behavior (bug, error, crash, regression, slowdown) has no one-command repro, or its proof stays red after one plain fix attempt. Not for a feature complaint.
context: fork
agent: exo:orchestrator
argument-hint: <symptom, failing command or error>
---
# Find cause

a. **Locate.** Until the cause is proven this skill outranks `spec` and `build`; a read-only planning turn writes the plan per `../spec/references/task-list.md`, reproduction test as Task 1. Worked before and one command reproduces it: run the bisect in `investigator-prompt.md`, then run `node "${CLAUDE_SKILL_DIR}/../../lib/scratch-exclude.mjs"` (with no symbol, `exo:research-worker` with `Sources: repo`).
b. **Investigate.** Proven needs a causal line plus a mechanism predicting it or holding in source: write `Status: proven`. Otherwise dispatch `exo:build-task` with `exo-kind: hardest` from `investigator-prompt.md`.
c. **Fix.** Settle where it commits per `../build/references/workspace.md`, else copy the handoff to `.exo/debug/`. Dispatch `general-purpose` from `fixer-prompt.md`, the prompt opening with `exo-kind: build` and a `Reads:` line, resume `failed` via SendMessage, else dispatch a fresh agent with the prior result path.
d. **Report.** Read only status lines and Report fields. After compaction, re-run `Repro`.

1. **Reproduce.** Read an existing log, profile or `.exo/` report first. One command reproduces it, else evidence, no fix.
   - Send long output to `<scratch>/debug-repro.log`, `<scratch>` from `node "${CLAUDE_SKILL_DIR}/../../lib/scratch-path.mjs" debug`; read with `tail -n 40`.
   - Steps 1-5 → read `references/loop.md` first.
2. **Instrument.**
3. **Isolate.**
4. **Predict, then fix.**
5. **Prove.**
6. **Retain project knowledge.** Per the table.
7. **Fresh eyes.** With no PR review, read Step 7 of `references/loop.md`, which sets `code-review` for when it prints `changed files` above 2 or `dependency-added yes`, or the fix crosses a public signature, persisted format or security boundary, then ends on `ship`.
   - Invoked by a stage or workflow: ask nothing, return to caller.

## References

| File | Read it when |
|---|---|
| `references/handoff.md` | b, c |
| `../build/references/workspace.md` | c |
| `investigator-prompt.md` | b |
| `fixer-prompt.md` | c |
| `../build/references/performance.md` | Speed |
| `references/loop.md` | 1-5, 7 |
| `references/profiling.md` | Trace |
| `../build/references/critique.md` | No review |
| `../build/references/security.md` | When its first line applies. |
| `../build/references/data-migration.md` | When its first line applies. |
| `../build/references/test-design.md` | When its first line applies. |
| `../build/references/project-knowledge.md` | 6 |
| `../../lib/references/closing.md` | Before the final message. |

Report: the report rule in `../../lib/references/closing.md` with the debug log path as the pointer; mechanism, proof lines and SHAs go to the log; unproven: `Repro`, `Expected`, `Actual`, `Hypotheses`.
