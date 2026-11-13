---
max_turns: 30
allowed_tools: [Read, Glob, Grep, Skill, Bash, Edit, Write]
scaffold_script: bash "$EXO_ROOT/evals/scaffold.sh" seed test-pollution
---

`npm test` fails on CI, yet the test that fails there passes when I run its file on its own. I need the suite to pass in any file order, and the tests themselves must stay as they are.
