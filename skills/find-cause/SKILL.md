---
name: find-cause
description: Use when reported wrong behavior (bug, error, crash, regression, slowdown) has no one-command repro, or its proof stays red after one plain fix attempt. Not for a feature complaint.
context: fork
agent: exo:orchestrator
argument-hint: <symptom, failing command or error>
model: opus
effort: medium
---
# Find cause

a. **Locate.** Until the cause is proven this skill outranks `spec` and `build`; a read-only planning turn writes the plan per `../spec/references/task-list.md`, reproduction test as Task 1. Worked before and one command reproduces it: follow `investigator-prompt.md`, then run `node "${CLAUDE_SKILL_DIR}/../../lib/scratch-exclude.mjs"` (no symbol: `exo:research-worker`, `Sources: repo`).
b. **Investigate.** Proven needs a causal line plus a mechanism predicting it or holding in source: write `Status: proven`. Else dispatch `exo:build-task` with `exo-kind: hardest` from `investigator-prompt.md`.
c. **Fix.** Settle where it commits per `../build/references/workspace.md`, else copy the handoff to `.exo/debug/`. Change only what the request names.
   - Last round only, after failures: 2 parallel fixer candidates, keep the passing one.
   - Dispatch `general-purpose` from `fixer-prompt.md`, the prompt opening with `exo-kind: build` and a `Reads:` line, resume `failed` via SendMessage, else a fresh agent with the prior result.
d. **Report.** Read status lines and Report fields only; after compaction re-run `Repro`.

1. **Reproduce.** Read an existing log or `.exo/` report first. As the reporter, one command reproduces it, else evidence, no fix; unclear symptom: follow `../../lib/references/question.md` `## When to ask`.
   - Send long output to `<debug-dir>/debug-repro.log` (`<debug-dir>` from `node "${CLAUDE_SKILL_DIR}/../../lib/scratch-path.mjs" debug`); `tail -n 40`.
   - Steps 1-5 → read `references/loop.md` first.
2. **Instrument.**
3. **Isolate.**
4. **Predict, then fix.**
5. **Prove.**
6. **Retain project knowledge.** Follow `../build/references/project-knowledge.md`.
7. **Fresh eyes.** With no PR review, read Step 7 of `references/loop.md`, which sets `code-review` for when it prints `changed files` above 2 or `dependency-added yes`, or the fix crosses a public signature, persisted format or security boundary, then end on `ship`.
   - Invoked by a stage or workflow: ask nothing, return to caller.

## References

| File | Read it when |
|---|---|
| `references/handoff.md` | b, c |
| `../build/references/workspace.md` | c |
| `investigator-prompt.md` | b |
| `fixer-prompt.md` | c |
| `../build/references/performance.md` | Step 1, slowdown |
| `references/loop.md` | 1-5, 7 |
| `references/profiling.md` | Step 1, captured profile |
| `../build/references/critique.md` | Step 7, no PR review |
| `../build/references/security.md` | When its first line applies. |
| `../build/references/data-migration.md` | When its first line applies. |
| `../build/references/test-design.md` | When its first line applies. |
| `../build/references/project-knowledge.md` | 6 |
| `../../lib/references/closing.md` | Before the final message. |

Report: the rule in `../../lib/references/closing.md` with the debug log path as the pointer; mechanism, proof lines and SHAs go to the log; unproven: `Repro`, `Expected`, `Actual`, `Hypotheses`.
