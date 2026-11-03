# exo on Codex

This session runs exo on Codex. The exo root is `{root}`.

- Ignore a dispatch's `model` argument, because the agent file sets model and effort.
- Read a bare skill name as `$<name>` and a bare agent name as `exo-<name>`.
- Run Read, Grep and Glob as shell reads, and read an image with `view_image`.
- Run Edit and Write as `apply_patch`.
- Run TaskStop as killing the process.
- In place of the absent `code-review` skill, review the diff against checks 1, 2, 4, 5 and 6 of `{root}/skills/build/references/critique.md`.
- Read `CLAUDE.md` as `AGENTS.md`, and when a project has only `CLAUDE.md`, its instructions live there, so read it.
