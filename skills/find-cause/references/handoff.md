# Handoff

Each phase hands the next one a file, so a delegate starts from recorded evidence rather than a transcript. The enemy is a handoff that pastes logs and prose the next context must read whole. The overcorrection is a handoff so thin that the fix delegate reopens the investigation.

## Fields

Every phase after Step 1 hands off through one file, `<scratch>/<slug>.md` in the checkout's `.exo/debug/`; `<slug>` is the symptom in kebab-case, at most 40 characters, and `run-plan`'s bug fixer uses `task-<n>` in its place.

The investigate part, at most 25 lines, one line per field, in this order: `Symptom`; `Repro`, one bare command; `Expected`; `Actual`; `Log`, a path; `Hypotheses`, one line each of claim, deciding observation, kept or dropped; `Cause`, a path:line symbol; `Mechanism`, at most 3 lines; `Prediction`, the output the fix changes; `Ranges`, the path:a-b the fix reads; `Status`, one of `proven`, `unproven`, `no-repro`.

The fix delegate appends a `## Fix` section: `Tests`, the files holding only the new failing test, else `none`; `Edits`, each path with one line on what changed; `Proof`, before and after output at most 10 lines each with the log path for the rest; `Unresolved`, or `none`.

## Judgment

- Output that would break a field's line cap goes to the log and the field names the log path, because the report phase reads the handoff but never its logs.
