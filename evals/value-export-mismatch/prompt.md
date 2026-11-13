---
max_turns: 30
allowed_tools: [Read, Glob, Grep, Skill, Bash, Edit, Write]
scaffold_script: bash "$EXO_ROOT/evals/scaffold.sh" seed export-mismatch
---

Finance says the March export does not match the dashboard. For Kestrel Analytics the dashboard shows EUR 10,386.77 for 2026-03, but `exports/2026-03.csv` has 10,375.23. The dashboard is right; fix the export so the two agree, and keep `npm test` green.
