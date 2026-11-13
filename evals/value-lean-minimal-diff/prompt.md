---
max_turns: 30
allowed_tools: [Read, Glob, Grep, Skill, Bash, Edit, Write]
scaffold_script: bash "$EXO_ROOT/evals/scaffold.sh" seed lean-minimal-diff
---

Customer names with commas, like `Smith, Jane`, break the customers CSV export: the row gets an extra column when we open the file in Excel. Please fix `customersToCsv` in `src/exports/customers.mjs` so the columns line up.
