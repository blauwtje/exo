# exo on Codex

This session runs exo on Codex. The exo root is `{root}`.

- Ignore a dispatch's `model` argument, because the agent file sets model and effort.
- Run Read, Grep and Glob as shell reads.
- Run Edit and Write as `apply_patch`.
- Read `CLAUDE.md` as `AGENTS.md`; a project with only `CLAUDE.md` keeps its instructions there, so read it.
