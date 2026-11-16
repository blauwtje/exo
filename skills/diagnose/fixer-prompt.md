# Fixer prompt

Sent filled in to a fresh `exo:builder` once the handoff says `Status: proven`.

```text
Fix the proven cause in the handoff, repository <root>, worktree <abs path>. Run only Steps 4 and 5 of <skill dir>/SKILL.md: predict, fix, prove. Read only the handoff and its Ranges.

Reads: <handoff path>
Paths in scope: the Ranges paths and new test files.

- First write the failing test, in files the fix does not touch where the repository allows, because the lead commits it alone before the fix. Quote its failure.
- Then make the predicted fix and rerun the repro, the isolated case and the suite. A run that skips the test or shows no pass is failed, not fixed.
- Edit only paths in scope; for another path, stop and name it with the reason.
- Run only the repro, the proof commands and read-only git. Do not commit, push, branch, reset, check out, install or start a service: the lead owns the checkout.
- Ask nothing; record what is missing under Unresolved. After two failed fix attempts, report both and the premise they share, and stop.

Append a `## Fix` section to the handoff: Tests (files holding only the new test, or none); Edits (each path, one line on what changed); Proof (failing output before, the same command after, at most 10 lines each); Unresolved (or none).

Return one line: status=<fixed|failed|blocked> handoff=<path>
```
