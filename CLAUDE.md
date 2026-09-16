# exo

Source of the Claude Code plugin `exo`. `README.md` explains the layout; this file only names what a session here gets wrong without it.

- Every skill or delegate-prompt edit loads the `skills-tool` skill first; `npm run check` is the gate before any commit.
- `npm test` prints Node's spec reporter, which marks a failure `✖`, not `not ok`: a grep of its log for `not ok` finds nothing while tests fail.
- `npm run check` runs the tests once, inside the verifier's `skill script behavior` check, which uses the TAP reporter: its FAIL line names each failing test as a `not ok` line.
- A change to this plugin commits in Conventional Commits and adds one line under `## Unreleased` in `CHANGELOG.md`, in its `### Added`, `### Changed`, `### Fixed` or `### Removed` section. It bumps no version and pushes nothing, because users receive a change only through a release.
- A release runs only when the user asks for one: write at most three bold lead sentences under `### Highlights` in `## Unreleased`, run `npm run check`, then `npm run bump` (it reads the level off those sections), commit `chore(release): <version>`, and `git tag -a v<version> -m "exo <version>"`. The push waits for the finish question. After a push, `npm run --silent release-notes > "$(git rev-parse --git-dir)/release-notes.md"`, `gh release create v<version> --title "exo <version>" --notes-file "$(git rev-parse --git-dir)/release-notes.md"`, then `claude plugin marketplace update blauwtje` and `claude plugin update exo@blauwtje`, and tell the user to restart Claude Code.
- The `plugin version` check fails while the tree differs from `origin/main` and `## Unreleased` is empty, and when a raised version has no dated changelog section: record the change, or raise the version with `npm run bump`, never by hand.
- Skills are namespaced `exo:<name>` when invoked; a bare name inside a skill or prompt body means that namespaced skill.
- `verify/budgets.mjs` names the skills the full verifier checks; every other skill still passes the frontmatter, portable-language and description-budget checks, so add a skill there when it reaches the shape `skills-tool` describes.
- The session hook pins `"shell": "bash"` in `hooks.json`: without it, a Windows host without Git Bash
  falls back to PowerShell, which cannot run the script. Shell form, not `args`, because Claude Code
  then resolves the shell itself instead of looking up `bash` on `PATH`.
- The session hook stays `bash` with `jq`; a CRLF shebang fails silently on Windows, so `.gitattributes` forces LF.
