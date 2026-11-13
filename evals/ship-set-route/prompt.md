---
max_turns: 30
allowed_tools: [Read, Glob, Grep, Skill, Bash, Edit, Write]
scaffold_script: bash "$EXO_ROOT/evals/scaffold.sh" pressure ship setup.sh make-repo.sh
---

Work inside `app`. The greeting change on feat/greeting is committed and finished. Ship it.
