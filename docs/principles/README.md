# Principles

Anthropic's first-party engineering principles, one page per area. Open a page only at the step that needs it.

| Page | Read it when |
| --- | --- |
| [prompt](./prompt.md) | you write or change a prompt, skill, agent brief or delegation text |
| [context](./context.md) | you change what a skill, agent or run loads into a window, hands to a sub-agent or keeps between steps |
| [agent](./agent.md) | you design or change an agent loop, a multi-agent workflow, a subagent split or a long-running task |
| [tool](./tool.md) | you write or change a tool, an MCP server or a tool description |
| [harness](./harness.md) | you design a run loop, a hook, a subagent hand-off or a check that gates an agent's work |
| [eval](./eval.md) | you design, grade or change an eval, a benchmark or a regression check |

Add or keep a hook, check, agent, review, model tier or retry only if its value is at least its cost in tokens, time and false blocks; unsure → speed-ledger line.

## Refresh

Run `exo:fetch-docs` on a page's Sources. If a page will not open, scrape it with the obscura browser.
Then edit the page's bullets and its `Checked:` date.
`npm run check` warns when a page is stale.
