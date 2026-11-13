# Scorecard

Each release appends one row and no row is rewritten. The releasing session runs the commands; no script computes it.

- tracked files: `git ls-files | wc -l`
- check modules: `ls verify/checks | wc -l`
- test files: `ls tests | wc -l`
- check seconds: time `npm run check`
- always-on tokens: `claude plugin details exo`
- tokens per use of `build`, `gate`, `spec`, `find-cause` and `ship`: `claude -p "/skill-doctor"`, 7-day tokens divided by uses
- eval score with and without the plugin, cost ratio and time ratio: `claude plugin eval --json --max-cost-usd 20`

| date | commit | tracked files | check modules | test files | check seconds | always-on tokens | build | gate | spec | find-cause | ship | eval score with / without | cost ratio | time ratio |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-11-13 | 720b6cb3e | 2744 | 79 | 455 | 110 | 836 | 0.40M | 3.2M | 0.18M | 0.07M | 0.03M | | | |
