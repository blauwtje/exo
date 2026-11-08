---
name: gate
description: "Use when a plan's tasks are landed and its branch needs the gate before a pull request: the scripted checks, the branch review and its repairs. Not for landing a task (build) or a change with no plan."
context: fork
agent: exo:orchestrator
argument-hint: "[plan path] [--land]"
---

# Gate

The gate readies a branch for a pull request.

## The loop

1. **Run the gate.** `node "${CLAUDE_SKILL_DIR}/scripts/gate-step.mjs" --plan <plan path> --root <checkout> --base <base>` first. Read only its `STEP`, `LOG`, `NEXT`, `DECIDE` lines, no log file.
   - Then in one message: the full run in the background and step 2's dispatch; end the turn, no ScheduleWakeup, Monitor or sleep. A dispatched agent runs it in the foreground, timeout 600000.
   - No plan file → end the turn: ask for its path and name `build`'s no-plan route; hand-run no check or `ship`.
   - `SKIP`, `WARN`, `FIX-ONLY`, `SESSION`, `SELF-HOSTED` → `references/gate-lines.md`.
   - On `FAIL` or `UNPLANNED`, end the turn with its report, rerunning nothing.
2. **Review the branch.** Reviewer `none`: skip the dispatch, still merge.
   - Dispatch `exo:review-branch` per `DISPATCH Branch` in one message, starting `exo-kind: review-deep` unless the line has none, its fields and `Read:` changed files.
   - For a branch with many changed files, print the tree from `changedFileTree` in `lib/draw.mjs` first, so the reviewer sees the shape before reading.
   - Then run `gate-step.mjs --after review` with those flags and a `--report <path>` per report; follow its `NEXT` lines.
   - On a `CODEX offer` line, ask once for a `codex exec` review of plan and diff, into findings.
   - `--land` → skip.
3. **Repair the findings.** `FINDINGS` with `fix=1` or more, or `concern=1` or more, goes to the `exo:build-task` agent with `exo-kind: fix-review`, no model override, the dispatch line and `../build/review-fixer-prompt.md` by path.
   - One `exo:build-task` per `CLUSTER` line, in parallel, each with only its findings, `concern` ones too.
   - With `fix=0` and `concern=0`, go to step 4: no fixer dispatch, rerun or fix commit.
   - Else read `references/repair.md`.
4. **Offer the finish.** End on `ship`, unless a request or plan rules out a push; then say nothing left the machine.
   - `--land` → pass `--land` to `ship`.

## References

| File | Read it when |
|---|---|
| `references/review-rules.md` | `BLOCKED` return or resume. |
| `references/triage.md` | Step 2. |
| `references/repair.md` | Step 3. |
| `references/gate-lines.md` | Step 1. |
| `references/plan-checks.md` | Never. |
| `../../lib/references/closing.md` | Final message. |
| `references/review.md` | Mode `review`. |

Report: `REPORT` gets `Changed`, chores, `report`, `note` findings. Message: the report rule, three lines: `REPORT` path, `question` findings, one decision: `FAIL`, else `question`, else `ship`.
