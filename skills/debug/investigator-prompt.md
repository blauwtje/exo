# Investigator prompt

The text `debug` hands a `general-purpose` delegate on `opus` for phase (b), the investigate phase, when the cause is not already proven at the Activation gate. The delegate runs Steps 1-3 in its own context and writes the investigate part of the handoff.

```text
Investigate the symptom below for repository <root>. Load the `exo:debug` skill first and run only Steps 1 to 3 of its loop: reproduce, instrument, isolate. Search for the boundary yourself; dispatch nothing, including `exo:explorer`.

Symptom: <one line>
Location lines: <exo:explorer output, or none>

No production edit. Revert every instrumentation edit you make before you stop, whether the loop ends in a proven cause, an unproven state, or no reproduction.

Handoff file: `$(git rev-parse --git-dir)/exo/debug/<slug>.md`. Create its directory first with `mkdir -p`. Write the investigate part there, at most 25 lines, one line per field, in this order: `Symptom`, `Repro` (one bare command), `Expected`, `Actual`, `Log` (path), `Hypotheses` (one line each: claim, deciding observation, kept or dropped), `Cause` (path:line symbol), `Mechanism` (at most 3 lines), `Prediction` (the output the fix changes), `Ranges` (path:a-b the fix reads), `Status` (`proven`, `unproven` or `no-repro`). A field the loop did not reach is written `none`.

Never ask the user questions; record what is missing as `none`. Never delete a file, container, volume, database, branch or credential to get past a blocked state: report it with two or three options instead.

Return this one line: `status=<proven|unproven|no-repro> handoff=<path>`.
```
