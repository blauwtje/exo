# Fixer prompt

The text `find-cause` hands a `general-purpose` delegate on `sonnet` for phase (c), and `build` hands `exo:solve-hard` for a failed `Run:` naming no causal line: the caller's opening, then the shared block.

## find-cause opening

```text
Fix the proven cause in the handoff below, repository <root>. Load the `exo:find-cause` skill first and run only Steps 4 and 5 of its loop: predict, fix, prove. Read only the handoff file and its `Ranges`.

Handoff file: <path>
Paths in scope: the `Ranges` paths and the new test files under `Tests`.

Write the failing test the test-design row calls for first, in files the fix does not touch where the repository allows it, because the session commits those files alone before the fix.
Quote its failure.
Then make the predicted fix and prove it: re-run the reproduction and the isolated case, then the required suite, grepping its log for failures.
A run that skips the test or shows no clear pass is not proof: return `failed`, not `fixed`.

Return this one line: `status=<fixed|failed|blocked> handoff=<path>`.
```

## build opening

```text
Bug fix for task <n> of <plan path>, repository <root>.

You fix one failure whose cause is unproven. Load the `exo:find-cause` skill first and run only Steps 1 to 5 of its loop: reproduce, instrument, isolate, predict, fix, prove.
`git diff` shows the edits already made.

Symptom: <one line>
Failing command: <the Run: command>
Output: <at most ten lines, or the log path>
Paths in scope: <the task's Files: paths>
Handoff file: <root>/.exo/debug/task-<n>.md; write its investigate part before the fix.

The failing command above is the red proof: quote its failure before the edit and its pass after, and write no new test for it.
Rerun no `mcp:` command, the session does: prove the fix with Bash, report it deferred.

Return only the handoff path.
```

## Shared block

```text
Make the smallest change that fully does what the user asked.
Never cut correctness, security, data safety, accessibility or anything the user named to make a change smaller.

Hard boundaries:
- Edit only the paths in scope; a fix needing another path stops and reports that path and why.
- Bash runs the reproduce and proof commands and read-only git (`diff`, `status`, `log`, `show`); nothing that installs, migrates or starts a service.
- Never commit, push, branch, stash, reset, check out or run `gh`.
- Never delete a file, container, volume, database, branch or credential to get past a blocked state: report it with 2-3 options.
- Ask no questions; record what is missing under `Unresolved`.
- Two fix attempts that leave the symptom standing end the work: report both and stop.
- Run a long proof in the foreground with Bash `timeout: 600000` or a bounded `for` loop on a done file; never call `Monitor` or start with `sleep`.

Write the handoff file in the fields and order of the `exo:find-cause` skill's `references/handoff.md`, ending on its `## Fix` section, and write nothing elsewhere.
```
