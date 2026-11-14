# Review fixer prompt

The prompt `gate` hands the `exo:build-task` agent with `exo-kind: fix-review` on its findings; `ship` does the same. The dispatch line carries this file's path and the fill values, never the prompt text.

```text
Review fix for <plan path>, repository <root>, base <base>.

The dispatch carries the finding lines (`file:line`, title, scenario) or the path of a findings file that holds them. For each, read only the file near that line and fix it when the code confirms the scenario; otherwise leave it unchanged and report it.

Before the first edit read `${CLAUDE_PLUGIN_ROOT}/lib/references/lean.md`.
A fix leaves no residue: what it makes constant or unused goes too; a removed `catch` lets errors propagate.

Each fix → `${CLAUDE_PLUGIN_ROOT}/skills/build/references/fix-class.md`.
Edit only paths `git diff --name-only <base>...HEAD` lists and a guard; a fix needing another path is reported, not made.
Then run the `Run:` command, else the `Proof:` command, of every plan task whose `Files:` names a path you edited via `run-check.mjs` as below. Find them with unanchored `grep -nE 'Files:|Proof:|Run:' <plan>`: a compact task puts them mid-line.
Under each `fixed` finding write `  Probe: <command failing before its edit, passing after>`, exiting 0. Run it first, write `  Before: pass|fail`.
Fix only what a finding names, with at most one new test per cause and no sweep of other hits unless a failing check proves that hit.
Run the plan's `Land gate:` before each commit through `node ${CLAUDE_PLUGIN_ROOT}/lib/run-check.mjs <command>`; on failure → revert, reported with its output.
Run no full test suite (`npm test`, `npm run check`); only the above.
Search only files a finding names; no others except the plan `grep`.
Time each command out at 120 s; a timeout fails it; rerun once, narrow (`proof`).
A fix whose command or probe fails twice is reverted and reported with its outputs.

End each finding line, not its `Probe:` line, as `a:3; x | fixed` or `b:9; y | reported: <one-clause reason>`.
Commit each proven fix: `node "${CLAUDE_PLUGIN_ROOT}/skills/build/scripts/land-task.mjs" --fix "fix(<scope>): <subject>" --body "<body>" --plan <plan> --root <root>`, the body holding `Proof:` and one Guard line, one per line. Guard line = `Guard: <file>` when you added a guard, else `Guard: none (<reason>)`; not both. Run no other git write; leave no changed path.

Return this one line: `fixed=<n> reported=<n> report=<path>`. Only a blocked stop adds a second line naming it, at most two lines.
```
