# exo

Source of the Claude Code plugin `exo`. `README.md` explains the layout and `CONTRIBUTING.md` the
commands and internals; this file only names what a session here gets wrong without it.

## Commands

- `npm run check` is the gate before any commit. A clean run ends `SUMMARY PASS=19 FAIL=0 WARN=0 UNRUN=0`.
- `npm test` prints Node's spec reporter, which marks a failure `✖`, not `not ok`: a grep of its log for `not ok` finds nothing while tests fail.
- `npm run check` runs the tests once, inside the verifier's `skill script behavior` check, which uses the TAP reporter: its FAIL line names each failing test as a `not ok` line.
- `CONTRIBUTING.md` holds the rest of the command table, the hook wiring, the delegate models and the savings internals.

## Editing a skill

- Every skill or delegate-prompt edit loads the `skills-tool` skill first; it carries the shape and size rules, and `verify.mjs` is what enforces them.
- Skills are namespaced `exo:<name>` when invoked; a bare name inside a skill or prompt body means that namespaced skill.
- `verify/budgets.mjs` names the skills the full verifier checks; every other skill still passes the frontmatter, portable-language and description-budget checks, so add a skill there when it reaches the shape `skills-tool` describes.

## Changelog and release

- A change to this plugin adds one line under `## Unreleased` in `CHANGELOG.md`, in its `### Added`, `### Changed`, `### Fixed` or `### Removed` section. It bumps no version and pushes nothing, because users receive a change only through a release.
- The verifier's `plugin version` check fails while the tree differs from `origin/main` and `## Unreleased` is empty, and when a raised version has no dated changelog section: record the change, or raise the version with `npm run bump`, never by hand.
- A merge to `main` cuts the release: `.github/workflows/release.yml` runs `npm run check`, `npm run bump`, commits `chore(release): <version>`, tags `v<version>` and publishes the GitHub Release, and a merge whose `## Unreleased` is empty cuts nothing. Never run `npm run bump`, `git tag v<version>` or `gh release create` by hand: a hand-cut version collides with the next merge.
- A change the user should read about first carries at most three bold lead sentences under `### Highlights` in `## Unreleased`, written in the pull request that records the change, never in a release commit.
- Once `gh run list --workflow release.yml --limit 1` shows the release succeeded on the merge, the session installs it without being asked: it runs `claude plugin marketplace update blauwtje`, then `claude plugin update exo@blauwtje`, and tells the user to restart Claude Code, which is the one step left to them.
- After that update it removes every version folder under the config directory's `plugins/cache/blauwtje/exo/` except the new one and the one this session loaded, because a running session still reads its hooks and skills from the version it started on, and it lists the folders before removing them.

## Environment

- The session hook pins `"shell": "bash"` in `hooks.json`: without it, a Windows host without Git Bash
  falls back to PowerShell, which cannot run the script. Shell form, not `args`, because Claude Code
  then resolves the shell itself instead of looking up `bash` on `PATH`.
- The session hook stays `bash` with `jq`; a CRLF shebang fails silently on Windows, so `.gitattributes` forces LF.
