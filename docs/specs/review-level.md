## Goal
The gate picks its review level and its re-review the way most review tools and engineers do: the middle level by default, the light level only for a small change, and after a fix round a light review of the fix alone.

## Verdict
Verdict: go
Objection: the middle level costs more per gate run (about $0.92 against $0.19 for the review, one measurement each), so the saving has to come from the capped re-review, not from the level.

## Decisions
Evidence root: `.exo/karpathy-level/` in the main checkout (gate-compare.md, gate-compare-2.md, gate-compare-3.md, gate-after.md).
1. Level: `low` when the plan has one task and no `Risk:` line, else `medium`. The middle level is the default at GitHub Copilot (Balanced), Cursor (default) and Anthropic (Standard); the change picks the level at Anthropic (size), Cursor (smart), Greptile (Auto) and Jesse Vincent (obra) (size, complexity, risk). exo takes size from the plan's task count, because the plan already sizes each task, so no new number is needed. Measured on one diff: `low` found 1 of the 10 findings of `medium` and missed a break that parks every landing run. Rejected: a changed-lines threshold (a new number with no data), `high` for risk plans (not measured). (exo decided)
2. Re-review: after the one fix round of a gate finding, `exo:build` reruns `gate` with `--since <rev>`, the head before the fixes; the gate then reviews only `<rev>...<branch>` at `low`, reports what is left and hands no finding back a second time. Cursor reviews only the changes since its previous review and caps fixes at 3 attempts; Jesse Vincent (obra) allows one fix agent and one re-review on a cheaper tier with no second fix wave. exo takes one round. (exo decided)
3. The gate keeps Opus: no source puts a cheaper model on the last review (Anthropic, Jesse Vincent (obra) and GitHub Copilot use their strongest, OpenAI Codex and Pydantic the writer's model). No change. (exo decided)
4. The `docs/failures.md` line comes first: on 2026-11-14 the `low` review found 1 of 10 findings on one diff (1 run), and re-review rounds 2 and 4 of one branch cost 0.4 to 0.7M tokens with no code commit (1 branch). (exo decided)

## Non-goals
- A wall-clock timeout on the review (one source), a `high` level, a diff-size threshold, any change to `verify.mjs`.

## Assumptions
- [code] `skills/gate/SKILL.md` and `skills/build/references/tail.md` have room under their caps in `verify/budgets.mjs` once the new text replaces the old level clause; no cap is raised.

## Acceptance
- Task 1: `skills/gate/SKILL.md` step 3 names `low` for a one-task plan that names no `Risk:` and `medium` otherwise, hands a finding back with the `Then:` rerun command, and the `--since <rev>` re-review at `low` is final.
- Task 1: `skills/build/references/tail.md` runs the rerun its `Then:` line names (`gate` with `--since <rev>`) after the one fix round, and that report is final.
- Before: level `low` unless a `Risk:` line; a re-review repeats the whole-branch review. After: measured in Manual checks.

## Manual checks
- Run the gate once on the `review-level` branch and record tokens, seconds and findings next to `.exo/karpathy-level/gate-after.md`.

## Plan basis
Repository: .
Branch: review-level
Worktree setup: none
Land gate: npm run validate:static
Land: local
Commit: feat(gate): review at the middle level by default and re-review only the fix
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
- Smallest safe split: one task, because both rules sit in the same step of the same file.

## Tasks
### Task 1: feat(gate): review at the middle level by default and re-review only the fix
Depends on: none | Files: `skills/gate/SKILL.md`, `skills/build/references/tail.md`, `docs/skills/gate.md`, `docs/failures.md`, `tests/skill-text.test.mjs`, `lib/model-kinds.json`, `verify/model-kinds.mjs`, `tests/model-kinds.test.mjs`, `CONTRIBUTING.md`, `docs/behaviour/build.md`, `docs/behaviour/gate.md` | Data: a gate step 3 that names the level rule and the `--since <rev>` re-review | Risk: public signature | Red: none (the rule is text the test reads) | Evidence: none (sources per decision in gate-compare.md, gate-compare-2.md and gate-compare-3.md) | Proof: grep -q 'one task' skills/gate/SKILL.md && grep -q 'since <rev>' skills/gate/SKILL.md && grep -q 'since <rev>' skills/build/references/tail.md
