## Review

- 30 turns; findings file by turn 20; search checkout only; command silent for 60s stops.
- No text before or between tool calls.
- Scope `branch`: Read the dispatch's `input=` path first, else `<checkout>/.exo/review-input.md`.
- Confirm findings only from diff, range read, a single test file or `Probe:` command, never `gate.mjs`, `npm run check`, `npm run validate` or `npm test`; finding that needs the full suite → `question`.
- Nit, preference, refactor, later-only idea → unreported; `question` only for open plan intent.
- Finding → `fix` when repair stays inside diff paths, else `report`; never `fix` for repair changing no output, return value or followed instruction.
- Plan-pasted code, scope `overlap` or no scope → read `${CLAUDE_PLUGIN_ROOT}/skills/gate/references/plan-checks.md` first.
- Deleted test, removed or loosened assertion, added skip marker → `defect` marked `report`, quoting removed text, unless plan non-goal or task names it.
- `Red:` source: only `## Red lines` of `review-input.md`, one `Task <n>:` line each.
- A task is test-first only when its `Proof:` names a test file or runs a test runner, and with `Risk:`, `Red:` line after `Test first: yes`, or heading type `fix` with test file in `Files:`.
- Test-first task → `defect` marked `report` if its commit adds no test of changed behavior or `Red:` line reads `none` or is missing.
- Write only findings file; no git or `gh` writes, no background session, ask nothing; blocked → report options, delete nothing.

## Report

Write input to `merge-reviews.mjs` at the findings path the dispatch names.
- Verdict first: `CLEAN`, `FINDINGS`, `BLOCKED` (plan, base, diff unreadable); then only finding lines, at most 5 `note`.
- Findings by file, each on one line, no heading per finding: `file:start-end`; weight (`defect`, `concern`, `question`, `note`: style, naming, layout, test gap; marked `report`, never `concern`; `out-of-scope`: input class under a task's `Boundary:` `out`, marked `report`); rule; evidence; `fix`/`report`.
- Each `fix` finding → `  Probe: <command>`, `  Class: <rule field>`, `  Sweep: <read-only grep, diff files>`, `  Quote: <verbatim line>` under it, per `## Probe` in `${CLAUDE_PLUGIN_ROOT}/skills/gate/references/review-rules.md`.
```
a.js:1-2; defect; swallowed failure; bare catch; fix
  Probe: node --test a.js
  Class: swallowed failure
  Sweep: grep -n "catch {" a.js
  Quote: } catch {
```
- End with `Count:` per weight, `Read: <paths>` every file read, `Unread:` paths or `none`.

Return at most two lines: `verdict=CLEAN|FINDINGS|BLOCKED defect=<n> concern=<n> question=<n> note=<n> fix=<n> report=<path>`; only `BLOCKED` adds `Unread:` line.
