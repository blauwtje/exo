# exo

Source of the Claude Code plugin `exo`. `README.md` explains the layout and `CONTRIBUTING.md` the
commands and internals; this file only names what a session here gets wrong without it.

## Workflow

- exo loads in place from this checkout, so the main checkout stays on `main` and no change lands there directly: every edit runs in a worktree.
- A run opens with `git pull --ff-only` on `main`, then removes every worktree and branch, local and remote, already merged into `main`, so it never orchestrates atop stale state. `git branch --merged` misses a squash-merged branch, so the tidy also runs `git fetch --prune` and deletes every local branch whose upstream is gone (`git branch -vv` shows `: gone]`).
- The lead session only orchestrates, to keep its context small: every edit, fix and instruction-text change runs in a subagent under worktree isolation, independent parts in parallel, and a check that fails after integration goes to a fixer subagent too. Only the lead writes `CHANGELOG.md`, so two subagent branches never conflict on it.
- A subagent gets one bug or one concern, and a brief with two unrelated parts is split in two, because two bugs plus a skill load drove a subagent to 73k tokens in about 37 calls and into the budget hook before it committed.
- Landing merges the subagent branches in one integration worktree under `.worktrees/` (already gitignored), adds the `CHANGELOG.md` lines, runs `npm run check` once with its output sent to a log and reads back only the `SUMMARY` line and any failing lines, fast-forwards `main`, pushes `main` directly with no pull request, then removes every worktree and branch the run created, local and remote.
- This rule outranks the workspace question in `skills/implementing/references/workspace.md` and the pull-request route in `shipping` for this repository: nothing is asked about where to commit.
- The last line of a report that changed exo tells the user to run `/reload-plugins`; that is their only remaining step.

## Commands

- `npm run check` is the gate before any commit. A clean run ends `SUMMARY PASS=20 FAIL=0 WARN=0 UNRUN=0`.
- `npm test` prints Node's spec reporter, which marks a failure `✖`, not `not ok`: a grep of its log for `not ok` finds nothing while tests fail.
- `npm run check` runs the tests once, inside the verifier's `skill script behavior` check, which uses the TAP reporter: its FAIL line names each failing test as a `not ok` line.
- `CONTRIBUTING.md` holds the rest of the command table, the hook wiring, the delegate models and the savings internals.

## Editing a skill

- Every skill or delegate-prompt edit loads the `skills-tool` skill first; it carries the shape and size rules, and `verify.mjs` is what enforces them.
- A skill, agent, rule, hook or `CLAUDE.md` edit also follows `~/.claude/rules/instruction-style.md` when that file exists: its `paths` trigger loads it only on a read of a matching file, never on a create.
- Skills are namespaced `exo:<name>` when invoked; a bare name inside a skill or prompt body means that namespaced skill.
- `verify/budgets.mjs` names the skills the full verifier checks; every other skill still passes the frontmatter, portable-language, description-budget, body-budget and reference-shape checks, so add a skill there when it reaches the shape `skills-tool` describes.

## Changelog and release

- A change to this plugin adds one line under `## Unreleased` in `CHANGELOG.md`, in its `### Added`, `### Changed`, `### Fixed` or `### Removed` section. It bumps no version itself, because users receive a change only through the release its push to `main` cuts.
- The verifier's `plugin version` check fails while the tree differs from `origin/main` and `## Unreleased` is empty, and when a raised version has no dated changelog section: record the change, or raise the version with `npm run bump`, never by hand.
- A push to `main` cuts the release: it triggers `.github/workflows/release.yml`, which runs `npm run check`, `npm run bump`, commits `chore(release): <version>`, tags `v<version>` and publishes the GitHub Release, and a push whose `## Unreleased` is empty cuts nothing. Never run `npm run bump`, `git tag v<version>` or `gh release create` by hand: a hand-cut version collides with the next push.
- A change the user should read about first carries at most three bold lead sentences under `### Highlights` in `## Unreleased`, written in the commit that records the change, never in a release commit.

## Environment

- The session hook pins `"shell": "bash"` in `hooks.json`: without it, a Windows host without Git Bash
  falls back to PowerShell, which cannot run the script. Shell form, not `args`, because Claude Code
  then resolves the shell itself instead of looking up `bash` on `PATH`.
- The session hook stays `bash` with `jq`; a CRLF shebang fails silently on Windows, so `.gitattributes` forces LF.
