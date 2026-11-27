# exo

This is the source of the Claude Code plugin `exo`. Layout is in `README.md`; commands, internals and the plan loop are in `CONTRIBUTING.md`.

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
- The lead runs `node lib/run-check.mjs npm run check` once, in the background, to a log, and a delegate runs only its proof.
- Plan tasks use `Land gate: npm run validate:static`, and `npm run check` runs once as the Success criterion.
- Change a skill, agent, hook or check only for a user request or a failure seen in a real session, and add that failure to `evals/failures.md` first, after you count the session files that hold it with `rg -l -g '*.jsonl' -e '<regex>' ~/.claude/projects | wc -l` and record that count.

## Editing

- Before you design or change a prompt, context, agent, skill, hook, script, test, tool, harness, eval, benchmark or code, read `principles/README.md` and open only the page it names.
- Hooks and scripts do mechanical work only: count, match, parse, store, run. Code that judges meaning, like a word list per language, breaks on other languages.
- Skills and agents give that mechanical part to a script and keep the judgment, because the model reads every language and phrasing.
- Run `claude plugin eval` only before a release, always with `--max-cost-usd`.
- A bare skill name in a skill or prompt body means `exo:<name>`.
- Keep skills model-invoked, and make one manual only when its route eval shows it fires at the wrong time or when the user asks.
- Derive a new value from the repo, or use one overridable default or an `EXO_*_MS` var via `environmentMs`.

## Release

- Add one line per change under `## Unreleased` in `CHANGELOG.md`, in `### Added`, `### Changed`, `### Fixed` or `### Removed`, and raise no version.
- When the user asks for a release, run `gh workflow run release.yml`, and never run `npm run bump`, `git tag v<version>` or `gh release create` by hand, because a hand-cut version collides with the workflow's.
