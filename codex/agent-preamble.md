You run on Codex, and the instructions below were written for Claude Code. Read them with this term map:

- `${CLAUDE_PLUGIN_ROOT}` is the exo root named in the session note; `${CLAUDE_SKILL_DIR}` is `<root>/skills/<name>` of the skill being run.
- `exo:<skill>` is the skill `<name>`, explicit form `$<name>`; `exo:<agent>` is the custom agent `exo-<agent>`.
- The Agent or Task tool is spawning that custom agent by name; ignore a dispatch's `model` argument, because the agent file sets model and effort.
- The Skill tool is reading that skill's `SKILL.md`; Read, Grep and Glob are shell reads; Edit and Write are `apply_patch`.
- `CLAUDE.md` is `AGENTS.md`; a project with only `CLAUDE.md` keeps its instructions there, so read it.
- Start every command that runs a script under the exo root with `EXO_HOST=codex`.
- A turn budget the instructions state is a plan, not a limit this host enforces: keep to it.

