# Review fixer prompt

The prompt `verify` step 3 hands the `exo:fix-review` agent when the branch review returns `fix` or `concern` findings. The dispatch line carries this file's path and the fill values, never the prompt text.

```text
Review fix for <plan path>, repository <root>, base <base>, findings file <findings path>, input to `run-probes.mjs`.

You fix the findings a branch review wrote to the findings file above. For each finding marked `fix`, read only the `file:start-end` range it names. Leave every `report` finding except a `concern`, every `question` and every `note` unchanged.

Make the smallest change that fully does what the user asked.
Never cut correctness, security, data safety, accessibility or anything the user named to make a change smaller.
A fix leaves no residue: what it makes constant or unused goes too; a removed `catch` lets errors propagate.

Each `concern` → your agent body's concern rules.
Each fix → `${CLAUDE_PLUGIN_ROOT}/skills/build/references/fix-class.md`.
Edit only paths `git diff --name-only <base>...HEAD` lists, a concern's test file and a guard; a fix needing another path is not made and counts as reported.
After the fixes, run the `Run:` command, else the `Proof:` command, of every plan task whose `Files:` names a path you edited. Find them with unanchored `grep -nE 'Files:|Proof:|Run:' <plan>`: a compact task puts them mid-line.
Under each `fixed` finding, `concern` included, keep the reviewer's `  Probe:` line or write `  Probe: <command failing before its edit, passing after>`; it must exit 0.
Run each finding's `Sweep:` command before you mark it `fixed`: repair every hit in a branch-diff path like the named range; other hits count as reported. A Sweep still matching the repaired code is rewritten once, rerun once, else `reported: sweep matches repair`.
Run the plan's `Land gate:` before each commit; it fails on a fix → revert it, reported with the gate output.
Run no full test suite (`npm test`, `npm run check`); only the above.
Search only the files a finding names; no repository-wide search except each `Sweep:` command and the plan `grep`.
Give each command a timeout of at most 120 seconds; a timeout fails it, rerun once, narrower.
A fix whose command or probe fails twice is reverted; reported, outputs in the findings file.

End each finding line, not its `Probe:` line, as `a:3; x; fix | fixed` or `b:9; y; report | reported: <one-clause reason>`.
Commit each proven fix: `node "${CLAUDE_PLUGIN_ROOT}/skills/build/scripts/land-task.mjs" --fix "fix(<scope>): <subject>" --body "<body>" --plan <plan> --root <root>`, the body holding `Proof:`, `Sweep: <n> fixed` and one Guard line, one per line. Guard line = `Guard: <file>` when you added a guard, else `Guard: none (<reason>)`; not both. Run no other git write; leave no changed path.

Return this one line: `fixed=<n> reported=<n> report=<path>`. Only a blocked stop adds a second line naming it, at most two lines.
```
