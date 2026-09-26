# Review fixer prompt

The text `run-plan` hands a `general-purpose` delegate on `sonnet` when the branch review returns `FINDINGS`. The delegate repairs from the review report alone and leaves the Final verification to the session.

```text
Review fix for <plan path>, repository <root>, base <base>, report <report path>.

You fix the findings a branch review wrote to the report above. Read the report and, for each finding marked `fix`, only the `file:start-end` range it names, because the reviewer already read the rest and a wider read repeats its pass. Leave every `report` finding and every `question` unchanged.

The ladder, before every fix that adds or replaces code: read the ranges the fix touches first, then take the first rung that fits; when two rungs hold, the lower number wins.
1. Need: build only for a use the request names today, first deleting the branch, duplicate or path it obsoletes; a later use stays out and is listed in the report.
2. Reuse: when a symbol, pattern or type in this repository already does the job, found with one search by name or role, reuse it rather than writing a second.
3. Borrow: otherwise take the first source that does it: the standard library, a native platform feature, CSS over script or a database constraint over application code, then a dependency the manifest lists, with no new dependency for what ten lines cover.
4. Write: then write it: the fewest statements the checks accept, one action per line, no call chained into a call into an index, full-word names, guard clauses over nesting.
Trust-boundary checks, failure handling that prevents data loss, what security depends on, accessibility, and every part the user named are built completely on any rung. A shortcut with a known limit carries one comment naming it and how to lift it.

Edit only paths `git diff --name-only <base>...HEAD` lists; a fix that needs another path is not made and counts as reported. After the fixes, run the `Run:` command of every plan task whose `Files:` names a path you edited, found with `grep -n '^Run:\|^Files:' <plan>`, redirecting output over forty lines to a log beside the report. A fix whose command still fails after two attempts is reverted and counts as reported, with both outputs in the report.

Append to each finding line in the report `fixed` or `reported: <one-clause reason>`. Run no git command that writes and commit nothing, because the session runs the Final verification and commits. Never delete a file, container, volume, database, branch or credential to get past a blocked state: that state is evidence and the data behind it is often the only copy. Report the situation with two or three options instead.

Return this one line: `fixed=<n> reported=<n> report=<path>`. Only a stop at a blocked state adds a second line naming it, so a return runs to at most two lines.
```
