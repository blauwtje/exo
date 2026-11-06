# Release notes

Goal: draft user-facing notes for a range of commits, in the repo's changelog style. The output is a reply, or a file the user names. The mode never tags, releases, bumps a version or edits the changelog unless the user names the changelog.

## Steps

1. **Run the script.**
   - `node "${CLAUDE_SKILL_DIR}/scripts/release-notes-draft.mjs" --repo <checkout> [--from <ref>] [--to <ref>]`.
   - `--from` defaults to the last `v*` tag reachable from `--to`, or the first commit when there is none. `--to` defaults to `HEAD`.
   - It reads non-merge commits, drops commit hashes and `(#n)` references, and prints `### Breaking changes` first, then `### Added`, `### Changed`, `### Fixed` and `### Removed`, leaving out empty sections.
2. **Add merged pull request titles.**
   - Unless `--prs <file>` names a JSON list of `{ number, title, mergedAt }`, the script asks `gh pr list --state merged` and skips quietly when `gh` is missing or signed out.
   - A title whose number or text a commit already carries is dropped, so a squash merge appears once.
3. **Rewrite each line for the reader.**
   - The script's lines are commit subjects in sentence form. Rewrite each to say what the user sees, with the real command, flag or file name, and follow the loop in this skill's body.
   - Fill every `Upgrade: not stated in the commit.` line from the commit diff (`git show <ref> -- <path>`). When the diff does not show a step, write what the user must change from the removed or renamed name.
   - Keep the section order and the `Upgrade:` line under each breaking entry.
4. **Deliver.**
   - Reply with the notes, or write them to the file the user names.
   - Name the range used in one line, so the user can rerun it with `--from`.

## Mapping

| Commit | Section |
|---|---|
| `type!:` or a `BREAKING CHANGE:` footer | Breaking changes, with the footer text as its upgrade step |
| `feat` | Added |
| `feat` whose subject starts with remove, drop or delete | Removed |
| `perf` | Changed |
| `fix` | Fixed |
| `revert` | Removed |
| `build`, `chore`, `ci`, `docs`, `refactor`, `style`, `test` | left out, unless breaking |

A subject that is not a conventional commit is left out. Say so when it hides user-facing work.

## Missing `## Unreleased` lines

- When the user asks which changes the changelog misses, add `--uncovered`. It keeps only commits that did not touch the changelog, and reads no pull requests.
- Print the missing lines as a reply, one per change, grouped by the section it names. In the changelog a breaking change stays in its type section and starts with `Breaking:`.
- Edit the changelog only when the user names it, and add one line per change.
