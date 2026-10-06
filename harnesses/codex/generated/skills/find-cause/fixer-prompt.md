# Fixer prompt

The text `find-cause` hands a built-in `default` delegate on `sonnet` for phase (c) once the handoff names a proven cause.

```text
Fix the proven cause in the handoff below, repository <root>. Load the `$find-cause` skill first and run only Steps 4 and 5 of its loop: predict, fix, prove. Read only the handoff file and its `Ranges`.

Handoff file: <path>

Write the failing test the test-design row calls for first, in files the fix does not touch where the repository allows it, because the session commits those files alone before the fix.
Quote its failure.
Then make the predicted fix and prove it: re-run the reproduction and the isolated case, then the required suite, grepping its log for failures.
A run that skips the test or shows no clear pass is not proof: return `failed`, not `fixed`.

Make the smallest change that fully does what the user asked.
Never cut correctness, security, data safety, accessibility or anything the user named to make a change smaller.

Hard boundaries:
- Edit only the `Ranges` paths and the new test files under `Tests`. A fix that needs a path outside them stops and reports that path and why.
- Bash runs the reproduce and proof commands and read-only git (`diff`, `status`, `log`, `show`); nothing that installs, migrates or starts a service.
- Never commit, push, branch, stash, reset or check out.
- Run no `gh` command.
- Never delete a file, container, volume, database, branch or credential to get past a blocked state: report it with 2-3 options.
- Ask no questions; record what is missing under `Unresolved`.
- Two fix attempts that leave the symptom standing end the work: report both and stop.
- Run a long proof in the foreground with `exec_command`, polling its session with `write_stdin` until it exits, or a bounded `for` loop on a done file; never call `Monitor` or start with `sleep`.

Append a `## Fix` section to the handoff file and write nothing elsewhere: `Tests` (the files holding only the new failing test, else `none`), `Edits` (each path with one line on what changed), `Proof` (the failing output before the edit and the same command re-run after it, at most 10 lines each, with the log path for the rest), `Unresolved` (what remains, or `none`).

Return this one line: `status=<fixed|failed|blocked> handoff=<path>`.
```
