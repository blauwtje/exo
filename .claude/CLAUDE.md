# exo

This is the source of the Claude Code plugin `exo`. Layout is in `README.md`; commands, internals and the plan loop are in `CONTRIBUTING.md`.

## Workflow

- Keep the main checkout on `main` and run every edit in a worktree under `.claude/worktrees/`, because exo loads in place from this checkout.
- The lead (main session) only orchestrates: it runs `exo:spec`, writes the brief, builds with `exo:build <brief>` and sends code reading to `exo:research-worker`. This outranks the inline rules T1 to T4.
- Send every edit, fix and failed-check repair to a worktree subagent, one concern each, and run independent parts in parallel.
- Before the start-of-run cleanup, a squash, a worktree removal, a branch delete or a session push, read `.claude/landing.md`.
- Outside a run, only the lead writes `CHANGELOG.md`.
- Ask nothing about where to commit, because this workflow outranks `skills/build/references/workspace.md` and the pull-request route in `ship`.
- When a report changed exo, tell the user that a new session runs it and that `/reload-plugins` updates only the open session.

## Checks

- `npm run check` gates every commit, and a clean run ends `SUMMARY` with `FAIL=0 WARN=0 UNRUN=0`.
- The lead runs `npm run check` once, in the background, to a log, and a delegate runs only its proof.
- Plan tasks use `Land gate: npm run validate:static`, and `npm run check` runs once as the Success criterion.
- When a mistake recurs, add a check to `npm run check` or fix its code path, not a hook or prose line, because a hook adds overhead to every session.

## Editing

- Before designing a prompt, context, agent, tool, harness or eval, read `docs/principles/README.md` and open only the page it names.
- For a build speed or cost idea, run `node benchmarks/speed-ledger.mjs --index` and pass `benchmarks/speed-ledger.md` to every idea agent.
- A bare skill name in a skill or prompt body means `exo:<name>`.
- Derive a new value from the repo, or use one overridable default in run.json `defaults` or an `EXO_*_MS` var via `environmentMs`.

## Release

- Add one line per change under `## Unreleased` in `CHANGELOG.md`, in `### Added`, `### Changed`, `### Fixed` or `### Removed`, and raise no version.
- When the user asks for a release, run `gh workflow run release.yml`, and never run `npm run bump`, `git tag v<version>` or `gh release create` by hand, because a hand-cut version collides with the workflow's.
