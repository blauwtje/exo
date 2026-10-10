# exo

Source of Claude Code plugin `exo`. Layout → `README.md`; commands and internals → `CONTRIBUTING.md`.

## Workflow

- Main checkout stays on `main`; every edit runs in a worktree, because exo loads in place from this checkout.
- Run start → `git pull --ff-only` on `main`, then remove every worktree and branch, local and remote, merged into `main`; each worktree per the removal bullet below.
- Same tidy → `git fetch --prune`, then delete each local branch whose upstream is gone (`git branch -vv` shows `: gone]`); `git branch --merged` misses squash merges.
- Lead only orchestrates: every edit, fix and failed-check repair → worktree subagent; independent parts in parallel.
- `CHANGELOG.md` → only the lead writes it, so subagent branches never conflict on it.
- Subagent → one concern; brief with two unrelated parts → two subagents.
- `exo:spec` and `exo:build` → lead runs them itself; code reading goes to `exo:locate-code`, tasks to `exo:run-unit`; the lead writes the brief itself.
- Verify → one fresh subagent briefed with the skill and its inputs only, no checks beyond the skill's.
- Handover between phases → the brief and `.exo/` files.
- Land in one integration worktree under `.worktrees/`: merge subagent branches, add `CHANGELOG.md` lines, fetch, rebase onto `origin/main`.
- After rebase → every line of this run stays under `## Unreleased`; release workflow pushes a `chore(release)` commit after every push.
- Then → `npm run check` once, output to a log; read back only `SUMMARY` and failing lines; fast-forward `main`; push `main` directly, no pull request.
- After push → remove every worktree and branch the run created, local and remote.
- Remove worktree → from main checkout, one command per worktree: `node skills/build/scripts/remove-worktree.mjs --kept --worktree .worktrees/<name> --run .`. Not plain `git worktree remove`: it deletes the excluded `.exo/` with exit 0.
- `remove-worktree.mjs` → output not piped away, exit not masked.
- `remove-worktree.mjs` refuses → leave that worktree and its branch in place, report 2-3 options to user; no `--force`.
- Delete run branch → its own `git branch -D <name>` with literal name; git-guard checks that name against `main` and refuses one built through `$( )`.
- Branch deletions → separate command after a successful push, not in the same command as fast-forward or push: git-guard checks the whole command before any part runs, so finds branch commits missing from `main`.
- Subagent → no `git stash`; all worktrees share one stash list.
- Cleanup → drop a stash made on a run branch once its content is on `main`; leave every other stash untouched.
- Every shell wait loop, such as `until <condition>; do sleep N; done` → deadline: counter inside loop, exit with error after a set number of rounds. Not GNU `timeout`; stock macOS lacks it.
- This workflow outranks the workspace question in `skills/build/references/workspace.md` and the pull-request route in `ship`: ask nothing about where to commit.
- Report that changed exo → action line tells user to run `/reload-plugins`.

## Commands

- `npm run check` gates every commit; clean run ends `SUMMARY` with `FAIL=0 WARN=0 UNRUN=0`.
- `npm run check` → lead runs it once, in background, output to a log; delegate runs only its proof.
- Plan tasks here → `Land gate: npm run validate:static` (static checks, no test suite); `npm run check` runs once as Success criterion.
- `npm test` → spec reporter, failure marked `✖`, not `not ok`. `npm run check` → TAP, its FAIL line lists `not ok` lines.

## Editing

- Skill, agent, rule, hook or `CLAUDE.md` edit → read `skills/edit-skills/references/instruction-style.md` first, follow it.
- Bare skill name in a skill or prompt body = `exo:<name>`.

## Release

- Each change → one line under `## Unreleased` in `CHANGELOG.md`, in `### Added`, `### Changed`, `### Fixed` or `### Removed`; raise no version.
- Push to `main` cuts the release via `.github/workflows/release.yml`. Never run `npm run bump`, `git tag v<version>` or `gh release create` by hand; a hand-cut version collides with the next push.
- Change user should read first → at most three bold lead sentences under `### Highlights` in `## Unreleased`, in the commit that records it, not in a release commit.

## Environment

- `hooks/hooks.json` keeps `"shell": "bash"`; else a Windows host without Git Bash falls back to PowerShell.
- Hook command → shell form, not `args`, so Claude Code resolves the shell, not `bash` on `PATH`.
- Session hook stays Node (`hooks/session-start.mjs`), no `jq`.
- `.gitattributes` forces LF; a CRLF shebang fails silently on Windows.
