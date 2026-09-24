# exo

Source of the Claude Code plugin `exo`; `README.md` explains the layout, `CONTRIBUTING.md` the commands and internals.

## Workflow

- Keep the main checkout on `main` and run every edit in a worktree, because exo loads in place from this checkout.
- Open a run with `git pull --ff-only` on `main`, then remove every worktree and branch, local and remote, merged into `main`.
- The tidy also runs `git fetch --prune` and deletes each local branch whose upstream is gone (`git branch -vv` shows `: gone]`), since `git branch --merged` misses squash merges.
- The lead only orchestrates: every edit, fix and failed-check repair runs in a worktree subagent, independent parts in parallel.
- Only the lead writes `CHANGELOG.md`, so subagent branches never conflict on it.
- Give a subagent one concern; split a brief with two unrelated parts in two.
- Land in one integration worktree under `.worktrees/`: merge the subagent branches, add the `CHANGELOG.md` lines, then fetch and rebase onto `origin/main`, keeping every line of this run under `## Unreleased`, because the release workflow pushes a `chore(release)` commit after every push.
- Then run `npm run check` once with output to a log, read back only the `SUMMARY` and failing lines, fast-forward `main`, push `main` directly with no pull request, and remove every worktree and branch the run created, local and remote.
- Delete each run branch in its own `git branch -D <name>` with the literal name, because git-guard checks that name against `main` and refuses one built through `$( )`.
- A subagent never runs `git stash`, because all worktrees share one stash list; the cleanup drops a stash made on a run branch once its content is on `main`, and leaves every other stash untouched.
- This workflow outranks the workspace question in `skills/implementing/references/workspace.md` and the pull-request route in `shipping`: ask nothing about where to commit.
- End a report that changed exo with a line telling the user to run `/reload-plugins`.

## Commands

- `npm run check` gates every commit; a clean run ends `SUMMARY` with `FAIL=0 WARN=0 UNRUN=0`.
- `npm test` uses the spec reporter, which marks a failure `✖`, not `not ok`; `npm run check` runs the tests through TAP, so its FAIL line lists `not ok` lines.

## Editing

- A skill, agent, rule, hook or `CLAUDE.md` edit follows `~/.claude/rules/instruction-style.md` when it exists; read it first, because its `paths` trigger misses a newly created file.
- A bare skill name inside a skill or prompt body means `exo:<name>`.

## Release

- Record each change as one line under `## Unreleased` in `CHANGELOG.md`, in `### Added`, `### Changed`, `### Fixed` or `### Removed`, and raise no version.
- A push to `main` cuts the release through `.github/workflows/release.yml`; never run `npm run bump`, `git tag v<version>` or `gh release create` by hand, because a hand-cut version collides with the next push.
- A change the user should read first gets at most three bold lead sentences under `### Highlights` in `## Unreleased`, in the commit that records it, never in a release commit.

## Environment

- Keep `"shell": "bash"` in `hooks/hooks.json`, or a Windows host without Git Bash falls back to PowerShell; use shell form, not `args`, so Claude Code resolves the shell rather than `bash` on `PATH`.
- The session hook stays `bash` with `jq`, and `.gitattributes` forces LF, because a CRLF shebang fails silently on Windows.
