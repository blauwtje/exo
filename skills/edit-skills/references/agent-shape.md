# Shape of an agent

An agent takes the same shape as a skill with two changes: frontmatter carries the agent keys below, and the body closes with the exact report format its caller parses. An agent that writes code to a brief runs on the standard tier; only judges and hard repairs may run on the strong tier.

## Frontmatter

- `name` and `description` → required; `description` says when the caller dispatches it.
- `model` and `effort` → leave out; `lib/model-kinds.json` maps each agent file to a kind, and the `agent-effort` hook sets model and effort at dispatch.
- `tools` → an allowlist: the agent gets only the tools listed, so list what the job needs; discovery and bulk reading take few tools. `disallowedTools` removes from the inherited set instead.
- Other keys the harness reads: `maxTurns`, `autoCompactWindow` (100000 to 1000000), `skills` (first 32), `memory` (`user`, `project` or `local`), `background`, `omitClaudeMd`, `isolation`, `color`, `experimental`.
- Plugin agents ignore `permissionMode`, `mcpServers`, `hooks` and `initialPrompt` → leave them out of a plugin agent file.
- Unknown key → the harness ignores it without an error; `claude --debug` logs each key it does not recognize or apply, so run it once on a new agent.
