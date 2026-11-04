# exo

This is the source of the Claude Code plugin `exo`. Layout is in `README.md`; commands, internals and the plan loop are in `CONTRIBUTING.md`.

## Workflow

The **lead** is the main session that talks to the user. The lead only orchestrates, and subagents do the edits.

- Keep the main checkout on `main` and run every edit in a worktree, because exo loads in place from this checkout.
- The lead only orchestrates, which overrides the user rule "Other work → do it directly".
- Send every edit, fix and failed-check repair to a worktree subagent, one concern each, and run independent parts in parallel.
- At the start of a run, squash and push leftover commits on `main`, then run `git pull --ff-only`.
- Then run `git fetch --prune` and remove every worktree and branch merged into `main` or marked `: gone]` in `git branch -vv`, local and remote.
- Outside a run, only the lead writes `CHANGELOG.md`.
- The lead runs `exo:spec` and writes the brief itself, and sends code reading to `exo:locate-code`.
- Build with `exo:build <brief>`, and run headless `exo run` only from the user's terminal.
- Ask nothing about where to commit, because this workflow outranks `skills/build/references/workspace.md` and the pull-request route in `ship`.
- Squash: run `node lib/check-cache.mjs --query "npm run check"` first, where `pass` skips the check and `miss` runs `npm run check` once to a log.
- Then run `git merge --squash <branch>` and `git commit` one Conventional Commit, copy every branch `Evidence:` and `Proof:` line into the body, and do not push or open a pull request.
- Session push, at session end or when the user asks: run `git reset --soft origin/main`, then `git commit` one Conventional Commit.
- Name the session's main change in that subject, with the highest type in the batch (`feat` over `fix` over the rest).
- Give the body one line per squashed change plus every `Evidence:`, `Proof:` and `Drops:` line, then push `main` directly.
- Remove each worktree with `node skills/build/scripts/remove-worktree.mjs --kept --worktree .worktrees/<name> --run .`, one command per worktree, because `git worktree remove` deletes the excluded `.exo/`.
- Run `remove-worktree.mjs` unpiped with its exit visible and no `--force`; when it refuses, keep the worktree and branch and give the user 2-3 options.
- Delete a branch with `git branch -D <name>`, in its own command.
- A subagent runs no `git stash`, because all worktrees share one stash list.
- Give every shell wait loop a counter that exits with an error after a set number of rounds, because stock macOS has no GNU `timeout`.
- When a report changed exo, tell the user that exo loads in place so a new session runs it, and say to run `/reload-plugins` only for the open session.

## Principles

- When a mistake recurs, add a check to `npm run check` or fix its code path, not a hook or another prose line, because a hook adds overhead to every session.
- For a build speed or cost idea, run `node benchmarks/speed-ledger.mjs --index` and pass `benchmarks/speed-ledger.md` to every idea agent.

## Commands

- `npm run check` gates every commit, and a clean run ends `SUMMARY` with `FAIL=0 WARN=0 UNRUN=0`.
- The lead runs `npm run check` once, in the background, with output to a log, and a delegate runs only its proof.
- Plan tasks here use `Land gate: npm run validate:static`, and `npm run check` runs once as the Success criterion.

## Editing

- Before editing a skill, agent, rule, hook or `CLAUDE.md`, read `skills/edit-skills/references/instruction-style.md`, plus `agent-shape.md`, `hook-shape.md` or `script-shape.md` beside it.
- Before designing a prompt, context, agent, tool, harness or eval, read `docs/principles/README.md` and open only the page it names.
- A bare skill name in a skill or prompt body means `exo:<name>`.
- Derive a new value from the repo, or use one overridable default in run.json `defaults` or an `EXO_*_MS` var via `environmentMs`.

## Release

- Add one line per change under `## Unreleased` in `CHANGELOG.md`, in `### Added`, `### Changed`, `### Fixed` or `### Removed`, and raise no version.
- Never run `npm run bump`, `git tag v<version>` or `gh release create` by hand, because a hand-cut version collides with the workflow's.
- When the user asks for a release sooner, run `gh workflow run release.yml`.
