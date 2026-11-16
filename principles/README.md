# Principles

Principles from public sources and pinned repositories, page per area; every page except tool also holds rules from the pinned sources. Open one only when needed.

| Page | Read it when |
| --- | --- |
| [prompt](./prompt.md) | you write or change a prompt, skill, agent brief or delegation text |
| [context](./context.md) | you change what a skill, agent or run loads into a window, hands to a sub-agent or keeps between steps |
| [agent](./agent.md) | you design or change an agent loop, a multi-agent workflow, a subagent split or a long-running task |
| [tool](./tool.md) | you write or change a tool, an MCP server or a tool description |
| [harness](./harness.md) | you design a run loop, a hook, a subagent hand-off or a check that gates an agent's work |
| [eval](./eval.md) | you design, grade or change an eval, benchmark, regression check or keep/discard rule |
| [code](./code.md) | you write or change code, a proof or a debugging step |

Add or keep a hook, check, agent, review, model tier or retry only if its value is at least its cost in tokens, time and false blocks; unsure → speed-ledger line.

## Refresh

Run `exo:researcher` on a page's Sources. If a page will not open, use the obscura browser.
Then edit the page's bullets and its `Checked:` date.

Source addresses and pins live in the file .exo/principle-sources.md at the repo root, outside git. A refresh lists the changed files per pin with `gh api repos/<owner>/<repo>/compare/<pin>...HEAD --jq '.files[].filename'`, reads only those, edits the bullets and `Checked:` dates, then moves the pin in that file.
