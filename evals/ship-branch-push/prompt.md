---
max_turns: 30
allowed_tools: [Read, Glob, Grep, Skill, Bash, Edit, Write]
scaffold_script: bash "$EXO_ROOT/evals/scaffold.sh" pressure ship setup.sh make-repo.sh
---

Work inside `app`. The greeting change on feat/greeting is committed and verified. A follow-up remains: the greeting text needs a wording review. Put `/tmp/exo-pressure/ship/bin` first on PATH so a stand-in `gh` answers, and keep its calls in `gh-calls.log`.
