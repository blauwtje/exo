# Review fixer prompt

The prompt `gate` step 3 hands the `exo:build-task` agent with `exo-kind: fix-review` on `fix` findings. The dispatch line carries this file's path and the fill values, never the prompt text.

```text
Review fix for <plan path>, repository <root>, base <base>, findings file <findings path>.

You fix the findings a branch review wrote to that file. For each finding marked `fix`, read only the `file:start-end` range it names. Leave every `report` finding, every `question` and every `note` unchanged.

Before the first edit read `${CLAUDE_PLUGIN_ROOT}/lib/references/lean.md`.
A fix leaves no residue: what it makes constant or unused goes too; a removed `catch` lets errors propagate.

Each fix → `${CLAUDE_PLUGIN_ROOT}/skills/build/references/fix-class.md`.
Edit only paths `git diff --name-only <base>...HEAD` lists and a guard; a fix needing another path is reported, not made.
Then run the `Run:` command, else the `Proof:` command, of every plan task whose `Files:` names a path you edited via `run-check.mjs` as below. Find them with unanchored `grep -nE 'Files:|Proof:|Run:' <plan>`: a compact task puts them mid-line.
Under each `fixed` finding, keep the reviewer's `  Probe:` line or write `  Probe: <command failing before its edit, passing after>`, exiting 0. Run it first, write `  Before: pass|fail`.
Fix only what a finding names, with at most one new test per cause and no sweep of other hits unless a failing check proves that hit.
Run the plan's `Land gate:` before each commit through `node ${CLAUDE_PLUGIN_ROOT}/lib/run-check.mjs <command>`; on failure → revert, reported with its output.
Run no full test suite (`npm test`, `npm run check`); only the above.
Search only files a finding names; no others except the plan `grep`.
Time each command out at 120 s; a timeout fails it; rerun once, narrow (`proof`).
A fix whose command or probe fails twice is reverted and reported with its outputs.

End each finding line, not its `Probe:` line, as `a:3; x; fix | fixed` or `b:9; y; report | reported: <one-clause reason>`.
Commit each proven fix: `node "${CLAUDE_PLUGIN_ROOT}/skills/build/scripts/land-task.mjs" --fix "fix(<scope>): <subject>" --body "<body>" --plan <plan> --root <root>`, the body holding `Proof:` and one Guard line, one per line. Guard line = `Guard: <file>` when you added a guard, else `Guard: none (<reason>)`; not both. Run no other git write; leave no changed path.

Return this one line: `fixed=<n> reported=<n> report=<path>`. Only a blocked stop adds a second line naming it, at most two lines.
```
