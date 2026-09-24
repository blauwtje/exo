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
2. **Instrument.** Keep two hypotheses the reproduction leaves standing and add one observation that tells them apart at their first divergent boundary. Locate that boundary and its callers yourself, in this same context; phase (a) below dispatches `exo:explorer` first, before this loop starts, when the symptom names no file or symbol.
3. **Isolate.** Remove inputs or branches until one more removal makes the symptom vanish, in an ephemeral copy when a shared file would change. Two rounds that leave both hypotheses standing end the loop: report the reproduction, both hypotheses and every observation, and stop, because a third round is guessing.
4. **Predict, then fix.** Before any production edit, state the causal line, the output that will change, and why; settle where the fix commits as `../implementing/references/workspace.md` says; apply the security and data-migration rows; then make only the change the prediction requires.
5. **Prove.** Re-run the reproduction and the isolated case, then the required suite under Step 1's output rule, grepping its log for failures. Close under the closing rule in `using-exo`: the mechanism, then at most ten output lines that prove it, and the log path.
6. **Retain project knowledge.** When proof reveals a build, test or run command, or a failure-causing gotcha, missing from root `AGENTS.md` (root `CLAUDE.md` when that is absent), append one line there; with neither file create nothing, and never record session history.
7. **Fresh eyes.** Skip it when the caller says a pull-request review follows, because that is the fresh look. Otherwise, when any size fact is true—more than two changed files, a dependency, a public signature, a crossed persisted format or security boundary, or a required file outside initial inspection—run the `code-review` skill on the session's model and its default target, at the effort `node "${CLAUDE_SKILL_DIR}/../implementing/scripts/pick-reviewer.mjs" --effort` prints, `skip`, `low` or `medium`; the script counts only changed files and dependencies, so run at `low` instead of its `skip` when a public signature, a crossed persisted format or security boundary, or a required file outside initial inspection holds. Fix each confirmed correctness finding under Step 5's proof. Without that skill, run the critique row's checks and report that no separate context was available.

## Phases

The session runs the Activation gate, the optional locate, every dispatch and Step 7; a delegate runs only the steps its own brief names, in its own context, dispatches nothing, and writes the handoff.

a. **Locate.** When the symptom names no file or symbol, dispatch `exo:explorer` before the loop starts; its location lines go into the investigate brief.
b. **Investigate.** Unless the Activation gate already proved the cause, dispatch a `general-purpose` delegate on `opus` from `investigator-prompt.md`: it loads `exo:debug`, runs Steps 1-3 itself with no `exo:explorer` inside, reverts every instrumentation edit, makes no production edit, writes the investigate part of the handoff, and returns `status=<proven|unproven|no-repro> handoff=<path>`. A gate-proven cause skips this phase: the session writes the investigate part itself from the evidence with `Status: proven` and moves to (c).
c. **Fix.** Before dispatch, settle where the fix commits per `../implementing/references/workspace.md`, because a delegate cannot ask. Dispatch a `general-purpose` delegate on `sonnet` from `fixer-prompt.md`: it loads `exo:debug`, reads only the handoff and its `Ranges` line, runs Steps 4-6, appends `## Fix` to the handoff, and returns `status=<fixed|failed|blocked> handoff=<path>`.
d. **Report.** Read only the status lines the delegates return; open the handoff itself only for the final report — unproven: `Repro`, `Expected`, `Actual`, `Hypotheses`; fixed: `Mechanism` and `Proof` under the closing rule in `using-exo` — and never the `Log` or `Ranges` paths it names.

## Handoff

Every phase after Step 1 hands off through one file, `$(git rev-parse --git-dir)/exo/debug/<slug>.md` (`mkdir -p` its directory first); `<slug>` is the symptom in kebab-case, at most 40 characters, and `implementing`'s bug fixer uses `task-<n>` in its place.

The investigate part, at most 25 lines, one line per field, in this order: `Symptom`; `Repro`, one bare command; `Expected`; `Actual`; `Log`, a path; `Hypotheses`, one line each of claim, deciding observation, kept or dropped; `Cause`, a path:line symbol; `Mechanism`, at most 3 lines; `Prediction`, the output the fix changes; `Ranges`, the path:a-b the fix reads; `Status`, one of `proven`, `unproven`, `no-repro`.

The fix delegate appends a `## Fix` section: `Edits`, each path with one line on what changed; `Proof`, before and after output at most 10 lines each with the log path for the rest; `Unresolved`, or `none`.

## References

| File | Read it when |
|---|---|
| `../implementing/references/workspace.md` | Step 4, before the first production edit. |
| `investigator-prompt.md` | Phase (b), to dispatch the investigate delegate. |
| `fixer-prompt.md` | Phase (c), to dispatch the fix delegate. |
| `../implementing-batch/references/performance.md` | Speed is the only symptom: load it before measuring, and measure before any hypothesis or edit. Never for wrong-output failures. |
| `references/profiling.md` | The symptom is a slowdown, memory growth, or a captured profile or trace: read it before profiling, instrumenting a live process, or attributing a hot path to source. |
| `../implementing-batch/references/critique.md` | Step 7 after proof, only when at least one listed size fact is true and `code-review` is absent. Do not load earlier. |
| `../implementing-batch/references/security.md` | After Step 4 identifies the predicted change and before its first affected test or production edit, only when changed behavior crosses authentication/authorization; tenant/resource ownership; secrets/credentials; untrusted input; network, file, or process execution; cryptography; or payments/regulated-data boundaries. Filenames and dependency names alone do not qualify. |
| `../implementing-batch/references/data-migration.md` | After Step 4 identifies the predicted change and before editing, only when the fix changes a database schema, persisted-data or file format, backfill, destructive DDL, persisted-data deletion, or compatibility between concurrently deployed versions. In-memory types, cache rebuilds, and version-only dependency bumps do not qualify. |
| `../implementing-batch/references/test-design.md` | After reproduction and before the first affected test or production edit, only when the symptom changes logic or public behavior and the repository exposes an automated test runner. Style, text, and version-only changes do not qualify. |

## Judgment

- Outside a read-only planning turn, `debug` outranks `shaping`, `planning`, and `implementing-batch` until the cause is proven; at proof `debug` applies the predicted fix itself through Steps 4 to 7 and offers `implementing-batch` on the next-stage question for edits beyond the predicted change. Inside one, `planning` owns the turn and schedules reproduction as its first phase.
- A user-stated cause outranks investigation only after it matches the source and predicts the reproduction.
- Return to Step 1 instead of patching again when the repair reaches a second owner, an old route and its replacement both run, supporting code grows while behavior stays the same, or the path from input to symptom cannot be followed in one reading: each means the proven cause was not the real one.
- After Step 7 the predicted fix commits in Conventional Commits where Step 4 placed it. Edits the proof leaves beyond it end the turn on `node "${CLAUDE_SKILL_DIR}/../using-exo/scripts/next-stage.mjs" --after debug --artifact none`'s output; with none left, the turn ends on `shipping`.
- After a compaction, read the newest handoff's `Status` and `Repro` lines and re-run `Repro` before the next dispatch, because the command, not memory, says whether the symptom still exists.
