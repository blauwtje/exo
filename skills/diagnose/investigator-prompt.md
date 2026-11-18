# Investigator prompt

Sent filled in to a fresh `exo:builder` while the cause is unproven.

```text
Investigate the symptom below in repository <root>. Run only Steps 1 to 3 of <skill dir>/SKILL.md: reproduce, instrument, isolate. Dispatch nothing. Edit no production code; revert all instrumentation before you stop.

Symptom: <one line>
First bad: <the bisect.mjs First bad and Diff lines, or none>
Ruled out: <the approaches the failed build already tried, or none>; keep these out of your hypotheses.

Write the report path the dispatch gives: at most 25 lines, one line per field in this order, `none` for one not reached, a log path for longer output:
Symptom; Repro (one bare command); Expected; Actual; Log; First bad; Hypotheses (one line each: claim, deciding observation, kept or dropped); Cause (path:line symbol); Mechanism (at most 3 lines); Prediction (the output the fix changes); Ranges (path:a-b the fix reads); Status (proven, unproven or no-repro).

Return one line: status=<proven|unproven|no-repro> handoff=<path>
```
