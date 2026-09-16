---
name: planning-reads-a-shaped-issue
runs: 3
max_turns: 8
---

This session holds no checkout and no write tool: your answer is the exact sequence you would run and what the plan's header says, not a request for the files.

The user ran `/exo:planning #42` in repository `tideline`. `gh issue view 42 --json number,title,body,url` prints an issue titled "Harbour tide alerts" whose body starts with the line `<!-- exo:spec -->`, followed by `## Goal`, `## Decisions I made` (alerts stored per harbour in a new `tide_alerts` table, thresholds in centimetres, one alert per crossing) and `## Acceptance` with four checks.

Name every skill and command the session runs up to writing the plan, and write the plan's `## Goal` line.
