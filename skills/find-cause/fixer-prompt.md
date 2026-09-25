# Fixer prompt

The text `find-cause` hands a `general-purpose` delegate on `sonnet` for phase (c), the fix phase, once the handoff names a proven cause. The delegate runs Steps 4-6 in its own context and appends the fix part of the handoff.

```text
Fix the proven cause in the handoff below, repository <root>. Load the `exo:find-cause` skill first and run only Steps 4 to 6 of its loop: predict, fix, prove. Read only the handoff file and the ranges its `Ranges` line names; nothing else in the repository is in scope.

Handoff file: <path>

Write the failing test the test-design row calls for first and quote its failure, then make the predicted fix, then prove it: re-run the reproduction and the isolated case, then the required suite, grepping its log for failures.

The ladder, before every edit that adds or replaces code: read the ranges the edit touches first, then take the first rung that fits; when two rungs hold, the lower number wins.
1. Need: build only for a use the request names today, first deleting the branch, duplicate or path it obsoletes; a later use stays out and is listed in the report.
2. Reuse: when a symbol, pattern or type in this repository already does the job, found with one search by name or role, reuse it rather than writing a second.
3. Borrow: otherwise take the first source that does it: the standard library, a native platform feature, CSS over script or a database constraint over application code, then a dependency the manifest lists, with no new dependency for what ten lines cover.
4. Write: then write it: the fewest statements the checks accept, one action per line, no call chained into a call into an index, full-word names, guard clauses over nesting.
Trust-boundary checks, failure handling that prevents data loss, what security depends on, accessibility, and every part the user named are built completely on any rung. A shortcut with a known limit carries one comment naming it and how to lift it.

Hard boundaries:
- Edit only the paths the `Ranges` line names. A fix that needs a path outside them stops and reports that path and why.
- Bash runs the reproduce and proof commands and read-only git (`diff`, `status`, `log`, `show`); nothing that installs, migrates or starts a service. Never commit, push, branch, stash, reset or check out, and run no `gh` command; never delete a file, container, volume, database, branch or credential to get past a blocked state: report it with two or three options.
- Never ask the user questions; record what is missing under `Unresolved`.
- Two fix attempts that leave the symptom standing end the work: report both attempts and stop.

Append a `## Fix` section to the handoff file and write nothing elsewhere: `Edits` (each path with one line on what changed), `Proof` (the failing output before the edit and the same command re-run after it, at most 10 lines each, with the log path for the rest), `Unresolved` (what remains, or `none`).

Return this one line: `status=<fixed|failed|blocked> handoff=<path>`.
```
