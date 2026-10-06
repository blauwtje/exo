# exo on Codex

This session runs exo on Codex. The exo root is `{root}`.

- Ignore a dispatch's `model` argument, because the agent file sets model and effort.
- A bare skill name means `$<name>`, a bare agent name `exo-<name>`.
- Run Read, Grep and Glob as shell reads; Read an image with `view_image`.
- Run Edit and Write as `apply_patch`.
- In place of the absent `code-review` skill, review the diff against checks 1, 2, 4, 5 and 6 of `{root}/skills/build/references/critique.md`.
- Read `CLAUDE.md` as `AGENTS.md`; a project with only `CLAUDE.md` keeps its instructions there, so read it.
