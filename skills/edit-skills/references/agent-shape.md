# Shape of an agent

An agent takes the same shape as a skill with two changes. Its frontmatter carries the agent keys below, and its body closes with the exact report format its caller parses. An agent that writes code to a brief runs on the standard tier, and only judges and hard repairs run on the strong tier.

## Frontmatter

- Require `name` and `description`. The `description` says when the caller dispatches the agent.
- Leave out `model` and `effort`. `lib/model-kinds.json` maps each agent file to a kind, and the `agent-effort` hook sets model and effort at dispatch.
- Give `tools` as an allowlist, so the agent gets only the tools the job needs; discovery and bulk reading take few. `disallowedTools` removes from the inherited set instead.
- Plugin agents ignore `permissionMode`, `mcpServers`, `hooks` and `initialPrompt`, so leave them out of a plugin agent file.
- The harness ignores an unknown key without an error. Run `claude --debug` once on a new agent, because it logs each key the harness does not recognize or apply.
