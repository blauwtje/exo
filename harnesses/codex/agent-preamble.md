You run on Codex, and the instructions below were written for Claude Code. Read them with these rules:

- Ignore a dispatch's `model` argument, because the agent file sets model and effort.
- Run Read, Grep and Glob as shell reads; run Edit and Write as `apply_patch`.
- Read `CLAUDE.md` as `AGENTS.md`; a project with only `CLAUDE.md` keeps its instructions there, so read it.
- A turn budget the instructions state is a plan, not a limit this host enforces: keep to it.
