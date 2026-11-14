## Goal
Clean up exo without removing any skill or agent: shorten and sharpen the content of every skill and agent, and remove hooks, scripts, lib files, checks and tests that nothing needs.

## Verdict
Verdict: go
Objection: 8 of the 17 frozen eval cases fail with and without exo (evals/value.md on branch exo-prove), so for adhd, context-limit, edit-skills, run, watch, write-docs, spec and ship the final eval cannot catch a regression; their only guard is `npm run check`.

## Decisions
1. Start fresh from main on branch exo-lean. Cherry-pick from branch exo-prove only bd4d78025 (frozen cases, evals/value.mjs) and c3c7460c0 (scaffold fix in evals/scaffold.sh, measured figures in evals/value.md). Do not take bba62be8a (the wholesale removal) or later commits. Main has not moved since exo-prove branched, so the picks apply cleanly. The exo-prove branch and worktree stay until exo-lean lands; landing removes them per .claude/landing.md. (exo decided)
2. Metric: total bytes of the files in scope (skills/**, agents/**, hooks/**, lib/**, verify/**, harnesses/**, output-styles/**; tests/** and evals/** excluded so deleting a test earns nothing), lower is better. A new frozen scorer evals/size.mjs prints `SCORE <bytes>` and prints no SCORE (broken run) when any baseline skill SKILL.md, agent .md or output-styles/adhd.md is missing. (exo decided)
3. Loop: the reduction runs as `exo:build improve`: scorer evals/size.mjs, direction lower, `--fast-check "npm run validate:static"`, one change per round, a round is kept only when SCORE drops and the check stays green, else reset. Ideas in order: dead code nothing imports or names (lib, scripts, checks, tests of deleted code), duplicate or restated rules across SKILL.md, references and agents, then wording cuts. A cut must keep every rule a test or check pins. The plan's task for this hands off to improve mode and does not do the cuts itself. (exo decided)
4. Hooks: a hook is removed only when its own measurement shows harm. Only dispatch-edit does (cases passed with exo 0, without 1, evals/value.md). Remove hooks/dispatch-edit.mjs, its hooks.json entry, and files only it names. Every other hook stays; its content may shrink in the loop. No signal (0/0) is not a reason to remove anything. (exo decided)
5. Budget: 40 USD of eval spend in total, passed as --max-cost-usd. The size loop costs 0 USD. Baseline per-part with-arm pass counts are the figures already stored in evals/value.md (no new baseline run). After the loop, run the frozen cases once with the exo arm only (`claude plugin eval` with --max-cost-usd 40); a part whose with-arm pass count falls below its stored baseline has its loop commits for that part's paths reverted. Store the new with-arm figures in evals/value.md. Drop the verdict column meaning removal: the table is evidence, not a removal list; the evals/value.mjs modes that remove parts (--check-removed) are deleted. (exo decided)
6. No cap in verify/budgets.mjs is raised; lowering caps to the new sizes is allowed. (exo decided)
7. Landing follows .claude/landing.md and .claude/CLAUDE.md: worktree, squash to main by the lead, no Land question. CHANGELOG.md lines under ## Unreleased are the lead's. No skill, agent, hook or instruction file names the method's originator. (exo decided)
8. Success criterion: `npm run check` ends SUMMARY with FAIL=0 WARN=0 UNRUN=0; evals/size.mjs SCORE below the main baseline; every baseline skill and agent file present; no part's with-arm pass count below baseline. Plan tasks use `Land gate: npm run validate:static`. (exo decided)

## Non-goals
- Removing any skill, agent or output-styles/adhd.md: skills/, agents/, output-styles/.
- Removing hooks other than dispatch-edit: hooks/.

## Assumptions
- [code] Main has not moved since exo-prove branched, so both picks apply cleanly (decision 1).

## Acceptance
- Task 1: value.mjs has no removal mode and value.md holds no removal verdict.
- Task 2: `node evals/size.mjs` prints `SCORE <bytes>`.
- Task 3: no file names dispatch-edit.
- Task 4: the improve run keeps only rounds whose SCORE dropped.
- Task 5: no part's with-arm pass count is below baseline.
- Success criterion: `npm run check` is clean.

## Manual checks
- Open a new session and run one skill, for example exo:spec on a small request. It should behave as before.

## Plan basis
Repository: /Users/thomash/Documents/Code/personal/plugins/exo/.claude/worktrees/exo-lean
Branch: exo-lean
Worktree setup: none
Land gate: npm run validate:static
Land: local
Commit: refactor(lean): shorten skills and agents and remove unneeded parts
Lint: none
App: none
Allow: none

## Success criterion
`npm run check` ends SUMMARY with FAIL=0 WARN=0 UNRUN=0.
Red: none (each task's Proof proves its own red)

## Checkpoint
- Blocks first: Task 1.
- Parallel: none.
- Shared state: evals/value.md, hooks/hooks.json.
- Smallest safe split: one task per concern, in order.

## Tasks
### Task 1: refactor(evals): take the frozen cases and drop the removal mode
Depends on: none | Files: `evals/`, `tests/value.test.mjs`, `docs/behaviour/hooks.md`, `docs/behaviour/verify.md` | Data: the frozen case folders and a value table kept as evidence | Red: none (the picks add files and the removal mode is deleted) | Evidence: none (no skill or agent wording changes) | Proof: node --test tests/value.test.mjs
### Task 2: feat(evals): add the size scorer
Depends on: 1 | Files: `evals/size.mjs`, `tests/size-score.test.mjs` | Data: one SCORE line over the bytes of the in-scope files | Proof: node --test tests/size-score.test.mjs
### Task 3: refactor(hooks): remove the dispatch-edit hook
Depends on: 1 | Files: `hooks/dispatch-edit.mjs`, `hooks/hooks.json`, `verify/hook-work.mjs`, `verify/budgets.mjs`, `CONTRIBUTING.md`, `tests/hooks.test.mjs`, `tests/codex-hooks.test.mjs`, `tests/context-limit.test.mjs`, `tests/hook-matchers.test.mjs`, `tests/hooks-sidecall.test.mjs`, `tests/live-shells.test.mjs`, `tests/node-guard.test.mjs`, `tests/worker-waits.test.mjs`, `tests/edit-code-rules.test.mjs`, `tests/fixtures/live-shells.json`, `tests/fixtures/refusals/live-shells.json`, `tests/guard-rules.test.mjs`, `tests/lead-write-nudge.test.mjs`, `tests/receipts.test.mjs` | Data: the hooks.json entry list | Red: none (the removal makes existing tests stop naming the hook) | Evidence: none (no skill or agent wording changes) | Proof: node --test tests/hooks.test.mjs
### Task 4: refactor(lean): run the size loop through improve mode
Depends on: 2, 3 | Files: `evals/size.mjs` | Data: the kept-round rows of the improve run | Red: none (the loop reduces bytes and the scorer file itself stays) | Evidence: none (the loop keeps a round only on a lower SCORE and a green check) | Proof: node evals/size.mjs
### Task 5: test(evals): run the exo arm once and revert regressed parts
Depends on: 4 | Files: `evals/value.md` | Data: with-arm pass counts per part in the value table | Red: none (the table holds figures only) | Evidence: none (no skill or agent wording changes) | Proof: node --test tests/value.test.mjs
