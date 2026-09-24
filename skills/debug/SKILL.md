---
name: debug
description: Use when existing behavior is reported wrong (bug, error, crash, regression, broken output, slowdown) and no evidence yet shows one causal line plus a mechanism predicting the symptom. Not when a diagnostic's file, line and symbol match the source, when the stated cause checks out, or for a feature complaint.
argument-hint: <symptom, failing command or error>
---
# Debug

Prove the mechanism before fixing it. The enemy is the plausible patch that hides the symptom without explaining it. The overcorrection is investigating after the evidence already names one causal line that predicts the failure.

**No production edit before a reproduction.** If the symptom cannot be triggered, the deliverable is reproduction evidence, not a fix.

## Activation gate

The cause is proven only when observed evidence names one causal line or boundary and a mechanism that predicts the symptom; a diagnostic's file and line count only when that source holds the invalid symbol, type or operation it describes. A proven cause skips to Step 4; anything less runs the loop.

## The loop

1. **Reproduce.** Capture a failing test, repeatable command or specific input, run as one bare command. Output over the cap goes to `$(git rev-parse --git-dir)/debug-repro.log`, read with `tail -n 40`, on every run in this loop, because a linked worktree's `.git` is a file, not a directory, and a pasted log rides in every later turn. When missing infrastructure blocks the symptom, name it and reproduce at the first repository-owned boundary that feeds it, claiming no equivalence. Then apply the test-design row.
2. **Instrument.** Keep two hypotheses the reproduction leaves standing and add one observation that tells them apart at their first divergent boundary. The `exo:explorer` agent locates that boundary and its callers; read only the ranges it names, because a search run here stays in context.
3. **Isolate.** Remove inputs or branches until one more removal makes the symptom vanish, in an ephemeral copy when a shared file would change. Two rounds that leave both hypotheses standing end the loop: report the reproduction, both hypotheses and every observation, and stop, because a third round is guessing.
4. **Predict, then fix.** Before any production edit, state the causal line, the output that will change, and why; settle where the fix commits as `../implementing/references/workspace.md` says; apply the security and data-migration rows; then make only the change the prediction requires.
5. **Prove.** Re-run the reproduction and the isolated case, then the required suite under Step 1's output rule, grepping its log for failures. Close under the closing rule in `using-exo`: the mechanism, then at most ten output lines that prove it, and the log path.
6. **Retain project knowledge.** When proof reveals a build, test or run command, or a failure-causing gotcha, missing from root `AGENTS.md` (root `CLAUDE.md` when that is absent), append one line there; with neither file create nothing, and never record session history.
7. **Fresh eyes.** Skip it when the caller says a pull-request review follows, because that is the fresh look. Otherwise, when any size fact is true—more than two changed files, a dependency, a public signature, a crossed persisted format or security boundary, or a required file outside initial inspection—run the `code-review` skill on the session's model and its default target, at `low` effort up to five changed files or 200 changed lines and `medium` above, and fix each confirmed correctness finding under Step 5's proof. Without that skill, run the critique row's checks and report that no separate context was available.

## References

| File | Read it when |
|---|---|
| `../implementing/references/workspace.md` | Step 4, before the first production edit. |
| `../implementing-batch/references/performance.md` | Speed is the only symptom: load it before measuring, and measure before any hypothesis or edit. Never for wrong-output failures. |
| `../implementing-batch/references/critique.md` | Step 7 after proof, only when at least one listed size fact is true and `code-review` is absent. Do not load earlier. |
| `../implementing-batch/references/security.md` | After Step 4 identifies the predicted change and before its first affected test or production edit, only when changed behavior crosses authentication/authorization; tenant/resource ownership; secrets/credentials; untrusted input; network, file, or process execution; cryptography; or payments/regulated-data boundaries. Filenames and dependency names alone do not qualify. |
| `../implementing-batch/references/data-migration.md` | After Step 4 identifies the predicted change and before editing, only when the fix changes a database schema, persisted-data or file format, backfill, destructive DDL, persisted-data deletion, or compatibility between concurrently deployed versions. In-memory types, cache rebuilds, and version-only dependency bumps do not qualify. |
| `../implementing-batch/references/test-design.md` | After reproduction and before the first affected test or production edit, only when the symptom changes logic or public behavior and the repository exposes an automated test runner. Style, text, and version-only changes do not qualify. |

## Judgment

- Outside a read-only planning turn, `debug` outranks `shaping`, `planning`, and `implementing-batch` until the cause is proven; at proof `debug` applies the predicted fix itself through Steps 4 to 7 and offers `implementing-batch` on the next-stage question for edits beyond the predicted change. Inside one, `planning` owns the turn and schedules reproduction as its first phase.
- A user-stated cause outranks investigation only after it matches the source and predicts the reproduction.
- Return to Step 1 instead of patching again when the repair reaches a second owner, an old route and its replacement both run, supporting code grows while behavior stays the same, or the path from input to symptom cannot be followed in one reading: each means the proven cause was not the real one.
- After Step 7 the predicted fix commits in Conventional Commits where Step 4 placed it. Edits the proof leaves beyond it end the turn on `node "${CLAUDE_SKILL_DIR}/../using-exo/scripts/next-stage.mjs" --after debug --artifact none`'s output; with none left, the turn ends on `shipping`.
- After a compaction notice, re-run the Step 1 reproduction before the next edit, because the command, not memory, says whether the symptom still exists.
