# Shape of an agent

An agent has the shape of a skill, with the agent keys below in its frontmatter and a body that closes with the exact report format its caller parses. Only judges and hard repairs run on the strong tier.

## Frontmatter

- Require `name` and `description`. The `description` says when the caller dispatches the agent.
- Leave out `model` and `effort`. `lib/model-kinds.json` maps each agent file to a kind, and the `agent-effort` hook sets model and effort at dispatch.
- Give `tools` as an allowlist, so the agent gets only the tools the job needs; discovery and bulk reading take few. `disallowedTools` removes from the inherited set instead.
- Plugin agents ignore `permissionMode`, `mcpServers`, `hooks` and `initialPrompt`, so leave them out of a plugin agent file.
- Run `claude --debug` once on a new agent, because the harness ignores an unknown key silently and the log names each key it does not apply.
