# Handoff

Each phase hands the next a file, so a delegate starts from recorded evidence, not a transcript. Too fat: pasted logs and prose the next context reads whole. Too thin: fix delegate reopens the investigation.

## Fields

- Every phase after Step 1 hands off through one file, `<scratch>/<slug>.md` in the checkout's `.exo/debug/`.
- `<slug>` = symptom in kebab-case, at most 40 characters.
- `build`'s bug fixer → `task-<n>` in place of `<slug>`; writes both parts.
- Output over a field's line cap → log; field names the log path, because the report phase reads the handoff, never its logs.

Investigate part: at most 25 lines, one line per field, this order; field the loop did not reach → `none`:

- `Symptom`.
- `Repro`, one bare command.
- `Expected`.
- `Actual`.
- `Log`, a path.
- `Hypotheses`, one line each: claim, deciding observation, kept or dropped.
- `Cause`, path:line symbol.
- `Mechanism`, causal line and why it produced the symptom, at most 3 lines.
- `Prediction`, output the fix changes.
- `Ranges`, path:a-b the fix reads.
- `Status`, one of `proven`, `unproven`, `no-repro`.

Fix delegate appends a `## Fix` section:

- `Tests`, files holding only the new failing test, else `none`.
- `Edits`, each path with one line on what changed.
- `Proof`, failing output before the edit and same command re-run after, at most 10 lines each, log path for the rest.
- `Unresolved`, or `none`.
