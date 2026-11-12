# aie-round1

## Verdict
Verdict: go
Objection: exo may already cover several ideas, so each was checked against the repo and dropped or merged with evidence.

## Goal
The ideas from round 1 of the AI Engineer talks that the repo does not already cover land as one static check family, one shared worker-result shape, one ship line and one watch fix.

## Decisions
1. Lint-style ideas share one check module, `verify/checks/skill-lint.mjs`, with a rule per idea: flags named in skill prose exist in script help, capped emphasis markers, remote-fetch and install-hook and CLAUDE.md-write and UserPromptSubmit grep, and conflicting `at most N <noun>` statements in one skill (exo decided).
2. Dispatch ideas (worker status, provenance, retry side effects, reviewer states what it searched) share one result shape in `lib/agent-modes/task-modes.md`: `Status: done | blocked | unknown`, `Did`, `Not done`, `Evidence`, `Side effects`, `Searched`; a timeout is `unknown` with its cause (exo decided).
3. `fix-ci.md` gains one ordering line: run the repo formatter or lint autofix before reading logs for an agent fix (exo decided).
4. Default caption language comes from the format marked original in yt-dlp `formats[].format_note`, falling back to `info.language`, because auto-dubbed audio makes `info.language` or the first `-orig` key wrong (exo decided).
5. Dropped or merged ideas are listed in `.exo/aie-round1/spec-detail.md` with evidence (exo decided).
6. Cut for size: per-line skill A/B evals (no small verifiable slice beyond existing `benchmarks/`), transcript mining for pipes and pushback, spec ambiguity probe (needs 7-10 subagent restatements per requirement) (exo decided).

## Non-goals
- Per-skill A/B eval harness: `benchmarks/`.
- Transcript analytics: `skills/watch/`.
- Test-weakening, hook exit codes, stash deny, option lists, parallel caps, Red-first criteria: already covered, see detail file.

## Assumptions
- code: `skills/watch/scripts/ytdlp-info.mjs` `pickCaptions` reads `info.language` and falls to the first `-orig` key (lines 11-33).
- code: `verify/late-checks.mjs:47` registers checks such as `checkScriptHelp`.
- assume: yt-dlp marks the original audio format with "original" in `format_note`.

## Acceptance
- Task 1: a fixture with `language: 'ar'` and an original `en` format picks `en-orig`.
- Task 2: each rule fails on a bad fixture and passes on the repo.
- Task 3: the shape appears in the mode file.
- Task 4: the fix-ci line exists.
- Success criterion: the full check.

## Manual checks

## Plan basis
Repository: /Users/thomash/Documents/Code/personal/plugins/exo
Branch: spec/aie-round1
Worktree setup: none
Land gate: npm run validate:static
Land: local
Commit: feat(aie): adopt round 1 ideas as a skill lint family, a worker result shape and a caption fix
Lint: none
App: none
Allow: none

## Success criterion
`npm run check`
Red: none (each task's Proof proves its own red)

## Checkpoint
- Blocks first: none.
- Parallel: Tasks 1, 2, 3 and 4.
- Shared state: `verify/checks/skill-lint.mjs`, `tests/skill-lint.test.mjs`.
- Smallest safe split: one task per concern.

## Tasks
### Task 1: fix(watch): pick the original audio language for default captions
Depends on: none | Files: `skills/watch/scripts/ytdlp-info.mjs`, `tests/watch-transcript.test.mjs`, `docs/behaviour/lib.md`, `docs/behaviour/ship.md`, `docs/behaviour/verify.md`, `docs/behaviour/watch.md`, `tests/watch-ytdlp-info.test.mjs` | Data: `pickCaptions` derives its wanted language from the format whose `format_note` says original, else `info.language` | Proof: node --import ./tests/clean-run-env.mjs --test tests/watch-transcript.test.mjs
### Task 2: feat(verify): add the skill lint check with flag, emphasis, safety and count rules
Depends on: none | Files: `verify/checks/skill-lint.mjs`, `verify/late-checks.mjs`, `tests/skill-lint.test.mjs`, `tests/coordination-contract-check.test.mjs` | Data: `skillLintFindings(repository)` returns `{ path, line, rule }` rows, one function per rule: flags named in skill prose missing from script help, more than 2 `IMPORTANT`, `CRITICAL` or `MUST` per file, remote fetch or install hooks or CLAUDE.md writes or UserPromptSubmit registration, and one skill folder stating `at most N <noun>` with two N | Proof: node --import ./tests/clean-run-env.mjs --test tests/skill-lint.test.mjs
### Task 3: feat(agents): add one worker result shape
Depends on: none | Files: `lib/agent-modes/task-modes.md`, `tests/agents.test.mjs`, `tests/fixer-mark.test.mjs`, `tests/worker-waits.test.mjs` | Data: result lines `Status`, `Did`, `Not done`, `Evidence`, `Side effects`, `Searched` in the mode file | Evidence: none (static prose, no eval run) | Proof: node --import ./tests/clean-run-env.mjs --test tests/agents.test.mjs tests/fixer-mark.test.mjs tests/worker-waits.test.mjs
### Task 4: docs(ship): fix a failing check with the autofix before an agent fix
Depends on: none | Files: `skills/ship/references/fix-ci.md` | Data: one bullet under `## Rerun rules` | Evidence: none (static prose, no eval run) | Proof: grep -n 'autofix' skills/ship/references/fix-ci.md
