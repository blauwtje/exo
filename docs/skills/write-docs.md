# write-docs

Writes docs, pull requests, issues, commit messages and changelog lines in plain, specific words.

## When it runs

Only when you type `/exo:write-docs`, to write or edit text someone reads later: a README, doc page, PR, issue or commit body, changelog line or brief.

Not for chat replies or code comments.

## What you get

- Facts and numbers instead of claims like "more robust".
- Real file, option and command names, one name per thing.
- Whole sentences in plain words.
- A check against a list of AI writing tells, each with an id a review can cite.
- Release notes drafted from the commits (and merged pull request titles, when `gh` is signed in) between two refs, the last release tag to `HEAD` by default: breaking changes first with an upgrade step, then Added, Changed, Fixed and Removed, with no commit hashes. The reply or the file you name holds the draft, and `--uncovered` lists the commits that `CHANGELOG.md` misses. It never tags or releases.

## Source

`skills/write-docs/SKILL.md`, `references/ai-tics.md`, `references/release-notes.md` and `scripts/release-notes-draft.mjs`.
