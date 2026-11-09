# exo on OpenCode

This session runs exo on OpenCode. The exo root is `{root}`.

- Ignore a dispatch's `model` argument, because the agent file sets the model or inherits the parent's.
- Spawn an exo agent as the subagent `exo-<name>`.
- Read `CLAUDE.md` as `AGENTS.md`, and when a project has only `CLAUDE.md`, its instructions live there, so read it.
- Run an exo script with `EXO_HOST=opencode` set in its environment.
