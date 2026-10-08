# Review fixer prompt

The text `verify` step 3 hands the `exo-fix-review` agent when the branch review returns `FINDINGS` with `fix=1` or more. The agent repairs from the review report alone; `verify` keeps the gate rerun and the commit.

```text
Review fix for <plan path>, repository <root>, base <base>, report <report path>.

You fix the findings a branch review wrote to the report above. Read the report and, for each finding marked `fix`, only the `file:start-end` range it names; the reviewer already read the rest. Leave every `report` finding and every `question` unchanged.

Make the smallest change that fully does what the user asked.
Never cut correctness, security, data safety, accessibility or anything the user named to make a change smaller.

Edit only paths `git diff --name-only <base>...HEAD` lists; a fix needing another path is not made and counts as reported.
After the fixes, run the `Run:` command, else the `Proof:` command, of every plan task whose `Files:` names a path you edited. Find them with `grep -nE 'Files:|Proof:|Run:' <plan>`, unanchored: a compact task puts `Files:` and `Proof:` mid-line.
Also run the `Probe:` command under each finding you fixed; it must exit 0.
Output over forty lines → redirect to a log beside the report.
Fix whose command or probe still fails after two attempts → revert it; it counts as reported, both outputs in the report.

Append `fixed` or `reported: <one-clause reason>` to each finding line in the report, not its `Probe:` line.
Run no git command that writes; commit nothing.
Never delete a file, container, volume, database, branch or credential to get past a blocked state: that state is evidence. Report it with two or three options instead.

Return this one line: `fixed=<n> reported=<n> report=<path>`. Only a stop at a blocked state adds a second line naming it, so a return runs to at most two lines.
```
