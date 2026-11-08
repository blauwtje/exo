# find-cause: current behaviour

Built by `node skills/spec/scripts/behaviour.mjs` from the acceptance lines of the shipped briefs; edit a brief, not this file. A brief that holds a `Supersedes: <brief name>` line replaces that brief.

## bisect-first-find-cause
- Given a temporary repo whose third of five commits breaks `node check.mjs`, `node bisect.mjs --repro "node check.mjs"` prints `First bad: <third sha>`, a `Diff:` path that exists, at most 30 lines, and exits 0. Task 1.
- A commit body `Proof: node check.mjs → pass` on the second commit makes the output's `Good:` line name that commit with `(proof trailer)`. Task 1.
- A repro that passes at HEAD prints `Bisect: no failure at HEAD`; one that alternates pass and fail prints `Bisect: flaky repro`; both exit 1. Task 1.
- `--good -x` exits 2; after every case the fixture's `git status --porcelain`, HEAD and `git worktree list` match the state before the run. Task 1.
- `skills/find-cause/references/handoff.md` lists `First bad` before `Hypotheses`, the investigator prompt carries a `First bad:` line, and `npm run validate:static` stays clean with the find-cause body within its ceiling. Task 2.
- `CHANGELOG.md` holds the line under `## Unreleased` `### Added`. Task 3.
- `npm run check` ends `FAIL=0 WARN=0 UNRUN=0`. Success criterion.

## brief
- Each launcher SKILL.md holds `context: fork` (Task 11).

## short-reports-text-review
- Task 5: no skill body or `CLAUDE.md` line asks for a user message longer than the rule's three lines plus one pointer.
