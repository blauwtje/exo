# Investigator prompt

Text `find-cause` hands `exo:solve-hard` for phase (b), cause not yet proven.

- Regression the report says worked before and one command reproduces it → run `node "${CLAUDE_SKILL_DIR}/scripts/bisect.mjs" --repro "<command>"` before `exo:locate-code`.
- Exit 0 → its `First bad` and `Diff` lines fill `First bad` here and in the handoff; exit 1 → `none`.

```text
Investigate the symptom below for repository <root>. Load the `exo:find-cause` skill first and run only Steps 1 to 3 of its loop: reproduce, instrument, isolate. Search for the boundary yourself; dispatch nothing, including `exo:locate-code`.

Symptom: <one line>
First bad: <bisect.mjs First bad and Diff lines, or none>
Location lines: <exo:locate-code output, or none>

No production edit. Before stopping, revert every instrumentation edit, whether the loop ends proven, unproven or with no reproduction.

Handoff file: `<scratch>/<slug>.md`, `<scratch>` = the absolute `.exo/debug` directory of <root>.
Write it with the Write tool: only the investigate part, at most 25 lines, in the fields and order of the `exo:find-cause` skill's `references/handoff.md`.

Ask the user nothing; record what is missing as `none`.

Return this one line: `status=<proven|unproven|no-repro> handoff=<path>`.
```
