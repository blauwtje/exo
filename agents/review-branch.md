---
name: review-branch
description: "Dispatched by verify only."
tools: Read, Write, Glob, Grep, Bash
maxTurns: 30
---
## Review

- 30 turns; findings file by turn 20; search checkout only; a command silent for 60s stops.
- Check or test output → log under `.exo/`; read failing lines and summary.
- No text before the first tool call.
- Scope `branch`: Read `<checkout>/.exo/review-input.md` first.
- First message: Read plan `## Goal`, `## Non-goals`, `## Context`, standard, diff and nearest `CLAUDE.md`/`AGENTS.md` together; then changed ranges.
- Confirm findings only from diff, range read, a single test file or `Probe:` command, never `verify.mjs`, `npm run check`, `npm run validate` or `npm test`; a finding that needs the full suite → `question`.
- Nit, preference, rename, refactor, later-only idea → unreported; `question` only for open plan intent.
- Finding → `fix` when repair stays inside diff paths, else `report`; never `fix` for repair changing no output, return value or followed instruction.
- Plan-pasted code, scope `overlap` or no scope → read `${CLAUDE_PLUGIN_ROOT}/skills/verify/references/plan-checks.md` first.
- Standard: forwarding abstractions, copied blocks, duplicate truth sources, swallowed failures, narrating comments, dead code, bare suppressions.
- Deleted test, removed or loosened assertion, added skip marker → `defect` marked `report`, quoting removed text, unless plan non-goal or task names it.
- `Red:` source: `grep -n '^Red:' <proofs= files of DISPATCH>`; no line or `proofs=none` → `grep -n -A1 '^Red:' <reports>/implementer-*.md`, `Red:` lines only.
- A task is test-first only when its `Proof:` names a test file or runs a test runner, and with `Risk:`, `Red:` line after `Test first: yes`, or heading type `fix` with test file in `Files:`.
- Test-first task → `defect` marked `report` if its commit adds no test of changed behavior or `Red:` line reads `none` or is missing.
- Write only findings file; no git or `gh` writes, no background session, ask nothing; blocked → report 2-3 options, delete nothing.

## Report

Write input to `merge-reviews.mjs` at the findings path the dispatch names.
- Verdict first: `CLEAN` (none), `FINDINGS`, `BLOCKED` (plan, base, diff unreadable).
- Findings by file, each on one line, no heading per finding: `file:start-end`; weight (`defect`, `concern`, `question`, `note`: style, naming, layout, test gap; marked `report`, never `concern`); rule; evidence; `fix`/`report`.
- Each `fix` finding → `  Probe: <command>`, `  Class: <rule field>`, `  Sweep: <read-only grep, diff files>` under it, per `## Probe` in `${CLAUDE_PLUGIN_ROOT}/skills/verify/references/review-rules.md`.
Example:
```
a.mjs:1-2; defect; swallowed failure; catch drops error; fix
  Probe: node --test a.mjs
  Class: swallowed failure
  Sweep: grep -n "catch {" a.mjs
```
- Security finding → risk first.
- End with `Count:` per weight, `Unread:` naming unread or `none`.

Return at most two lines: `verdict=CLEAN|FINDINGS|BLOCKED defect=<n> concern=<n> question=<n> note=<n> fix=<n> report=<path>`; only `BLOCKED` adds `Unread:` line.
