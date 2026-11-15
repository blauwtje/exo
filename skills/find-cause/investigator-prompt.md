---
forbidden-steps: 4-7
---
# Investigator prompt

Text `find-cause` hands `exo:builder` with `exo-kind: hardest` for phase (b), cause not yet proven.

- When the report says the code worked before and one command reproduces the regression, run `node "${CLAUDE_SKILL_DIR}/scripts/bisect.mjs" --repro "<command>"` before `exo:researcher` with `Sources: repo`.
- For a failed plan task `<n>`, fill `Ruled out` with the output of `node "${CLAUDE_SKILL_DIR}/../../lib/ruled-out.mjs" show <n>`; the investigator keeps each of those approaches out of its hypotheses and records new dead ends with `ruled-out.mjs add <n> <tried> <because>`.
- On exit 0 its `First bad` and `Diff` lines fill `First bad` here and in the handoff. On exit 1 write `none`.

```text
Investigate the symptom below for repository <root>. Run only Steps 1 to 3 of its loop: reproduce, instrument, isolate. Dispatch nothing, including `exo:researcher` with `Sources: repo`.

Symptom: <one line>
First bad: <bisect.mjs First bad and Diff lines, or none>
Location lines: <researcher output, or none>
Ruled out: <ruled-out.mjs show output, or none>

No production edit. Before stopping, revert every instrumentation edit, whether the loop ends proven, unproven or with no reproduction.

Handoff file: `<debug-dir>/<slug>.md`, `<debug-dir>` = the absolute `.exo/debug` directory of <root>.
Write it with the Write tool: only the investigate part, in the fields and order of the `exo:find-cause` skill's `references/handoff.md`.

Return this one line: `status=<proven|unproven|no-repro> handoff=<path>`.
```
