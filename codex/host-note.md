# exo on Codex

This session runs exo on Codex, so exo's skills and agents, written for Claude Code, map as follows. The exo root is `{root}`.

- Start every command that runs a script under `{root}` with `EXO_HOST=codex`, so the script reads Codex's settings, not Claude's.
- Read `${CLAUDE_PLUGIN_ROOT}` as `{root}`.
- Read `${CLAUDE_SKILL_DIR}` as `{root}/skills/<name>` for the skill being run.
- Read a skill named `exo:<name>` as the skill `<name>`; invoke it explicitly as `$<name>`.
- Read an agent named `exo:<name>` as the custom agent `exo-<name>`.
- Run the Agent or Task tool by spawning that custom agent by name.
- Ignore a dispatch's `model` argument, because the agent file sets model and effort.
- Run the Skill tool by reading that skill's `SKILL.md`.
- Run Read, Grep and Glob as shell reads.
- Run Edit and Write as `apply_patch`.
- Read `CLAUDE.md` as `AGENTS.md`; a project with only `CLAUDE.md` keeps its instructions there, so read it.
