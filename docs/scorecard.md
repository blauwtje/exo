# Scorecard

Each release appends one row and no row is rewritten. The releasing session runs the commands; no script computes it.

- tracked files: `git ls-files | wc -l`
- check modules: `ls verify/checks | wc -l`
- test files: `ls tests | wc -l`
- check seconds: time `npm run check`
- always-on tokens: `claude plugin details exo`
- tokens per use of `build`, `gate`, `spec`, `find-cause` and `ship`: `claude -p "/skill-doctor"`, 7-day tokens divided by uses
- eval score with and without the plugin, cost ratio and time ratio: `claude plugin eval --json --max-cost-usd 38`
- model and effort: the setting of that eval run; a second row records the same eval with `--model` set to another model

| date | commit | tracked files | check modules | test files | check seconds | always-on tokens | build | gate | spec | find-cause | ship | eval score with / without | cost ratio | time ratio | model | effort |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-11-13 | 720b6cb3e | 2744 | 79 | 455 | 110 | 836 | 0.40M | 3.2M | 0.18M | 0.07M | 0.03M | | | | | |
| 2026-11-13 | 209aac095 | 1086 | 40 | 310 | 82 | 836 | 0.40M | 3.3M | 0.18M | 0.07M | 0.03M | 0.36 / 0.29, onvolledig: 14/20, Opus 5.5 effort medium | 2.17 | 1.99 | | |
| 2026-11-13 | gate-small | | | | | | | | | | | gate eval: pending, run by the lead | | | | |
| 2026-11-14 | 0b768fd0a | | | | | | | 3.1M | | | | 0.25 / 0.22, 20 of 20 cases scored, Opus 5.5 effort medium | 1.69 | 1.62 | | |
| 2026-11-14 | gate-small | | | | | | | | | | | gate eval: 7/9 passes, 0.4659 per pass | | | | |
