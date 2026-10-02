# Investigator prompt

The text `find-cause` hands the `exo:solve-hard` agent for phase (b) when the cause is not already proven at the Activation gate.

```text
Investigate the symptom below for repository <root>. Load the `exo:find-cause` skill first and run only Steps 1 to 3 of its loop: reproduce, instrument, isolate. Search for the boundary yourself; dispatch nothing, including `exo:locate-code`.

Symptom: <one line>
Location lines: <exo:locate-code output, or none>

No production edit. Revert every instrumentation edit you make before you stop, whether the loop ends in a proven cause, an unproven state, or no reproduction.

Handoff file: `<scratch>/<slug>.md`, `<scratch>` being the absolute `.exo/debug` directory of <root>.
Write it with the Write tool.
Write the investigate part there, at most 25 lines, one line per field, in this order: `Symptom`, `Repro` (one bare command), `Expected`, `Actual`, `Log` (path), `Hypotheses` (one line each: claim, deciding observation, kept or dropped), `Cause` (path:line symbol), `Mechanism` (at most 3 lines), `Prediction` (the output the fix changes), `Ranges` (path:a-b the fix reads), `Status` (`proven`, `unproven` or `no-repro`).
A field the loop did not reach is written `none`.

Never ask the user questions; record what is missing as `none`.

Return this one line: `status=<proven|unproven|no-repro> handoff=<path>`.
```
