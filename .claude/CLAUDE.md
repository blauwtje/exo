# exo

This is the source of the Claude Code plugin `exo`. Layout, commands and internals are in `CONTRIBUTING.md`.

## Workflow

- Keep the main checkout on `main` and run every edit in a worktree under `.claude/worktrees/`, because exo loads in place from this checkout.
- The lead (main session) plans, reads a named file itself and makes a one-file, one-concern edit itself in a worktree, because a subagent for small work costs more tokens and time than the edit.
- Send parallel parts, work that needs a fresh context and every review to a fresh subagent, a worktree subagent for an edit, one concern each, because parallel work and a reader who did not write the change are what a subagent adds.
- Before the start-of-run cleanup, a squash, a worktree removal, a branch delete or a session push, read `.claude/landing.md`.
- Outside a run, only the lead writes `CHANGELOG.md`.
- Ask nothing about where to commit or whether to open a pull request: work lands on `main` as `.claude/landing.md` says.
- When a report changed exo, tell the user that a new session runs it and that `/reload-plugins` updates only the open session.

## Checks

- Run one test file with `node --import ./tests/clean-run-env.mjs --test tests/<name>.test.mjs`, the import `npm test` uses in package.json, because one file answers faster than `npm run check`.
- `npm run check` gates every commit, and a clean run ends `SUMMARY` with `FAIL=0 WARN=0 UNRUN=0`.
- Plan tasks use `Commit check: npm run validate:static`, and `npm run check` runs once as the Success criterion.
- Change a skill only after a real session that went wrong, and then remove something rather than add something.

## Editing

- Before you design or change a skill, agent or check, read `BASE.md`.
- Review every change before it lands, in rounds with one prompt to three reviewers: a fresh Claude subagent that compares it with `## The standard` in `CONTRIBUTING.md`, `opencode run -m opencode-go/gemini-4-argon#high --agent plan --archived` and `opencode run -m opencode-go/deepseek-v4.1-flash#high --agent plan --archived`, both given the diff, and the brief when there is one, with `-f`. Output holding `Error:` is a failed run. Show each finding on the real file, fix the shown ones in one pass, run `npm run check` and start the next round, until a round has no shown finding; a finding back after two fixes goes to the user, and a Go usage-limit message stops the loop.
- Scripts do mechanical work only: count, match, parse, store, run. Code that judges meaning, like a word list per language, breaks on other languages.
- Skills and agents keep the judgment and run plain commands, because the model reads every language and phrasing.
- A bare skill name in a skill or prompt body means `exo:<name>`.
- Keep skills model-invoked, and make one manual only when the user asks.

## Release

- Add one line per change under `## Unreleased` in `CHANGELOG.md`, in `### Added`, `### Changed`, `### Fixed` or `### Removed`, and raise no version.
- When the user asks for a release, run `gh workflow run release.yml`, and never run `npm run bump`, `git tag v<version>` or `gh release create` by hand, because a hand-cut version collides with the workflow's.
