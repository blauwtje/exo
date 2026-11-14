## Goal
After the one fix round of a gate finding, the gate reruns only the plan's checks and runs no second review.

## Verdict
Verdict: go
Objection: the change is small and the existing shape already matches consensus; the risk is touching more than the `--since` route.

## Decisions
1. Keep `gate` and its built-in `code-review` reviewer; the built-in review runs no tests, so removing the gate would let a red branch reach `ship`. (exo decided)
2. The `--since <rev>` re-review is replaced by `--recheck`: after the one fix round the gate reruns only `verify.mjs` (the plan's Proof and Success criterion) and runs no second review; its report is final and any `FAIL` is reported with no further round. A fix-diff-only review loses the surrounding code, no source documents it, and a test rerun is cheaper and catches what the fix broke at runtime. (exo decided)
3. The level rule stays: `low` for a one-task plan with no `Risk:`, else `medium`; the review reports correctness only. (exo decided)
4. The failure line goes in `docs/failures.md` first, after a transcript grep: 290 session files hold `--since <`, most of them reads of the gate skill text, and 2 branch re-review rounds cost 0.4 to 0.7M tokens with no code commit (user request). (exo decided)

## Non-goals
- Renaming the `review-branch` agent to `claims-judge` (`agents/`).
- The `ship` pr-merge wording (`skills/ship/references/pr-merge.md`).
- Any eval change (`evals/`).
- The `Round: n/3` fix-diff review rule in `lib/speed-rules.mjs`, which is the build worker brief, not the gate.

## Assumptions
- [code] Only `skills/gate/SKILL.md:6,21,22`, `skills/build/references/tail.md:5`, `docs/skills/gate.md:13`, `CHANGELOG.md:57` and the generated `docs/behaviour/gate.md:12` and `docs/behaviour/build.md:59` name `--since <rev>`; `skills/gate/scripts/verify.mjs`, `tests/` and `evals/gate-skip-review` do not.
- [code] `docs/behaviour/*.md` is built by `node skills/spec/scripts/behaviour.mjs` from shipped briefs, so this brief's `Supersedes: review-level` line replaces the old lines, and the two files are not edited by hand.
- [assume] No cap in `verify/budgets.mjs` rises, because the new text is not longer than the text it replaces.

## Acceptance
Supersedes: review-level
- Task 1: `skills/gate/SKILL.md` step 3 names `--recheck`: the gate runs step 2 only, runs no review, reports any `FAIL` as the final result and ends on `ship` when all pass.
- Task 1: `skills/build/references/tail.md` reruns `gate` with `--recheck` after the one fix round, and that report is final.
- Task 1: `docs/failures.md` holds the gate re-review entry and `CHANGELOG.md` holds one `### Changed` line under `## Unreleased`.
- Success criterion: `npm run check` ends `FAIL=0 WARN=0 UNRUN=0`.

## Manual checks
- Run the gate on a branch with one finding, fix it, run the gate again with `--recheck`, and see that the second run prints only check lines and starts no review.

## Plan basis
Repository: /Users/thomash/Documents/Code/personal/plugins/exo
Branch: gate-fix-recheck
Worktree setup: none
Land gate: npm run validate:static
Land: local
Commit: feat(gate): recheck the fix with the plan's checks instead of a second review
Lint: none
App: none
Allow: none

## Success criterion
`npm run check`
Red: none (the task's Proof proves its own red)
Product run: none (the plugin has no bin or start script)

## Checkpoint
- Blocks first: Task 1.
- Parallel: none.
- Shared state: none.
- Smallest safe split: one task, because the gate step, the build tail and the docs state one rule.

## Tasks
### Task 1: feat(gate): recheck the fix with the plan's checks instead of a second review
Depends on: none | Files: `skills/gate/SKILL.md`, `skills/build/references/tail.md`, `docs/skills/gate.md`, `docs/failures.md`, `CHANGELOG.md`, `tests/skill-text.test.mjs`, `lib/model-kinds.json`, `verify/model-kinds.mjs`, `tests/model-kinds.test.mjs`, `CONTRIBUTING.md`, `docs/behaviour/build.md`, `docs/behaviour/gate.md`, `docs/behaviour/lib.md`, `docs/behaviour/verify.md` | Data: a gate `--recheck` flag that runs only the check step and ends the run | Risk: public signature | Red: none (the rule is text the test reads) | Evidence: none (sources in .exo/verify-redesign/research.md) | Proof: grep -q 'recheck' skills/gate/SKILL.md && grep -q 'recheck' skills/build/references/tail.md && ! grep -rq -e '--since <' skills/gate/SKILL.md skills/build/references/tail.md docs/skills/gate.md
