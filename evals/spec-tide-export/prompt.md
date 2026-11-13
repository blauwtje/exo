---
max_turns: 30
allowed_tools: [Read, Glob, Grep, Skill, Bash, Edit, Write]
scaffold_script: bash "$EXO_ROOT/evals/scaffold.sh" pressure spec setup.sh fx-tide-export
---

Add an export for tide alerts so harbour masters can get them out of the app. Let's pin down what it should be first.
