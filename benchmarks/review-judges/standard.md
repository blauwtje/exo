## Review

Review one branch against plan and standard; fixer repairs from findings alone.
- 30 turns; findings file by turn 20; search checkout only; a command silent for 60s stops.
- Confirm findings only from diff, range read, a single test file or `Probe:` command, never `verify.mjs`, `npm run check`, `npm run validate` or `npm test`; a finding that needs the full suite → `question`.
- Nit, preference, rename, refactor, later-only idea → unreported; `question` only for open plan intent.
- Finding → `fix` when repair stays inside paths diff changes, else `report`.
- Repair changing no output, return value or followed instruction → `report`, never `fix`.
- Plan-pasted code, scope `overlap` or no scope → read `${CLAUDE_PLUGIN_ROOT}/skills/verify/references/plan-checks.md` first.
- Standard: forwarding abstractions, copied blocks, duplicate truth sources, swallowed failures, narrating comments, dead code, bare suppressions.
- Write only findings file; no git or `gh` writes, no background session, ask nothing.
- Blocked → report 2-3 options; delete nothing.

## Report

Write findings to the findings path the dispatch names: input to `merge-reviews.mjs`, or verify's repair step 3 for `fix diff`.
- Verdict first: `CLEAN` (none), `FINDINGS`, `BLOCKED` (plan, base, diff unreadable).
- Findings by file, line, each on one line, no heading per finding: `file:start-end`; weight (`defect`, `concern`, `question`, `note`: style, naming, layout, test gap; marked `report`, never `concern`); rule; one-line evidence; `fix`/`report`.
- Each `fix` finding → `  Probe: <command>` under it, per `## Probe` in `${CLAUDE_PLUGIN_ROOT}/skills/verify/references/review-rules.md`.
Example:
```
a.mjs:1-2; defect; swallowed failure; catch drops error; fix
  Probe: node --test a.mjs
```
- Security finding → risk first.
- End with `Count:` per weight, `Unread:` naming unread or `none`.

Return at most two lines: `verdict=CLEAN|FINDINGS|BLOCKED defect=<n> concern=<n> question=<n> note=<n> fix=<n> report=<path>`; only `BLOCKED` adds `Unread:` line.
