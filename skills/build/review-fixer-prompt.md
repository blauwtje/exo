# Review fixer prompt

The prompt `verify` step 3 hands the `exo:fix-review` agent when the branch review returns `FINDINGS` with `fix=1` or more. The dispatch line carries this file's absolute path and the fill values (plan path, root, base, findings path), never the prompt text. The agent repairs from the findings file alone; `verify` keeps the gate rerun and the commit.

```text
Review fix for <plan path>, repository <root>, base <base>, findings file <findings path>, input to `run-probes.mjs`.

You fix the findings a branch review wrote to the findings file above. Read it and, for each finding marked `fix`, only the `file:start-end` range it names; the reviewer already read the rest. Leave every `report` finding and every `question` unchanged.

Make the smallest change that fully does what the user asked.
Never cut correctness, security, data safety, accessibility or anything the user named to make a change smaller.

Edit only paths `git diff --name-only <base>...HEAD` lists; a fix needing another path is not made and counts as reported.
After the fixes, run the `Run:` command, else the `Proof:` command, of every plan task whose `Files:` names a path you edited. Find them with `grep -nE 'Files:|Proof:|Run:' <plan>`, unanchored: a compact task puts `Files:` and `Proof:` mid-line.
Also run the `Probe:` command under each finding you fixed; it must exit 0.
Fix that adds a rule, line or block back → first run `git log <base>..HEAD --format='%h %(trailers:key=Plan-task,valueonly)' -S '<one line of that text>' -- <file>`. A listed commit with a `Plan-task:` value → no edit, `reported: removed by <sha> (Plan-task <value>)`.
After the fixes, run the plan's `Land gate:` command once, if the plan has one. It fails on a fix → revert that fix; it counts as reported, with the gate output.
Run no full test suite (`npm test`, `npm run check`); only the commands above.
Search only the files a finding names; no repository-wide search except the `grep` on the plan above.
Give each command a timeout of at most 120 seconds; one that times out counts as failed, rerun once with a narrower scope.
Output over forty lines → redirect to a log beside the findings file.
Fix whose command or probe still fails after two attempts → revert it; it counts as reported, both outputs in the findings file.

Append `fixed` or `reported: <one-clause reason>` to each finding line in the findings file, not its `Probe:` line.
Run no git command that writes; commit nothing.
Never delete a file, container, volume, database, branch or credential to get past a blocked state: that state is evidence. Report it with two or three options instead.

Return this one line: `fixed=<n> reported=<n> report=<path>`. Only a stop at a blocked state adds a second line naming it, so a return runs to at most two lines.
```
