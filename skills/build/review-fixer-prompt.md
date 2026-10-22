# Review fixer prompt

The prompt `verify` step 3 hands the `exo:fix-review` agent when the branch review returns `FINDINGS` with `fix=1` or more or `concern=1` or more. The dispatch line carries this file's path and the fill values, never the prompt text. It repairs from the findings file alone; `verify` keeps the gate rerun and commit.

```text
Review fix for <plan path>, repository <root>, base <base>, findings file <findings path>, input to `run-probes.mjs`.

You fix the findings a branch review wrote to the findings file above. Read it and, for each finding marked `fix`, only the `file:start-end` range it names. Leave every `report` finding except a `concern`, and every `question` and `note`, unchanged.

Make the smallest change that fully does what the user asked.
Never cut correctness, security, data safety, accessibility or anything the user named to make a change smaller.

Each `concern` finding → first write a test that fails on it, and run it. It fails → repair until it passes. It passes → remove that test, append `reported: unproven`.
Edit only paths `git diff --name-only <base>...HEAD` lists, and a concern's test file; a fix needing another path is not made and counts as reported.
After the fixes, run the `Run:` command, else the `Proof:` command, of every plan task whose `Files:` names a path you edited. Find them with `grep -nE 'Files:|Proof:|Run:' <plan>`, unanchored: a compact task puts `Files:` and `Proof:` mid-line.
Write under each finding you mark `fixed`, including a `concern`, a `  Probe: <command that fails before its edit and passes after>` line before you return, the reviewer's own kept.
Run the `Probe:` command under each fixed finding; it must exit 0.
Fix that adds a rule, line or block back → first run `git log <base>..HEAD --format='%h %(trailers:key=Plan-task,valueonly)' -S '<one line of that text>' -- <file>`. A listed commit with a `Plan-task:` value → no edit, `reported: removed by <sha> (Plan-task <value>)`.
After the fixes, run the plan's `Land gate:` command once, if any. It fails on a fix → revert that fix; it counts as reported, with the gate output.
Run no full test suite (`npm test`, `npm run check`); only the above.
Search only the files a finding names; no repository-wide search except the plan `grep`.
Give each command a timeout of at most 120 seconds; a timeout counts as failed; rerun once, narrower.
Fix whose command or probe fails after two attempts → revert it; it counts as reported, both outputs in the findings file.

Append `fixed` or `reported: <one-clause reason>` to each finding line in the findings file, not its `Probe:` line.
Run no git command that writes; commit nothing.
Never delete a file, container, volume, database, branch or credential to get past a blocked state: that state is evidence. Report two or three options instead.

Return this one line: `fixed=<n> reported=<n> report=<path>`. Only a stop at a blocked state adds a second line naming it, at most two lines.
```
