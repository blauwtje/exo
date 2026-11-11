# loop-budget

## Goal
Every review, repair, verify, retry and refusal loop in exo runs under one script-enforced loop budget with one ledger per plan run, and `npm run check` fails any future loop or rule module that bypasses it.

## Verdict
Verdict: go
Objection: the loops count different units (review findings, look fail lines, proof reruns, refusal rules, session costs), so one ledger risks a generic counter that stops good rounds too early; the progress rule compares the per-kind count each kind already prints.

## Decisions
1. One module `lib/loop-budget.mjs` and one kinds table `lib/loop-kinds.json`, overridable via run.json `defaults` and `EXO_*_MS`; each kind holds a round cap, the count it compares for progress and its owner script. Every existing cap (repairBound, attemptCap, fixAttempt, look and critic rounds, proof reruns, orchestrator `Round: n/3`, task-runner reruns, run-no-wait `BLOCK_LIMIT`) moves to it and the old constant is deleted, not wrapped. (exo decided)
2. One ledger file per plan run in the run folder; every round of every kind appends one row (kind, round, open before, open after, wall ms, cost when known, verdict keep, discard or stop). Gate start, resume and re-entry read it and never reset it. It replaces `review-rounds.tsv`, the `<root>/.exo` placement of `review-round-pending.json` and the fixed `gate` journal id. (exo decided)
3. Rules, enforced by script and printed as one line `LOOP <kind> CONTINUE|STOP <reason>`: round cap per kind, default 3 (1 full pass and at most 2 fix rounds); a round whose open count is not lower is reverted and its kind stops; one run-wide wall budget with one default replaces 900000 versus 1800000; `maxRunUsd` applies where costUsd is known; both are checked before every round of every kind. At STOP the last green commit stays, open items go to the run report as `report`, and the loop ends with no question. (exo decided)
4. Only a finding with a verifiable criterion or a look fail line starts a fix round; concern, note and question go to the report. (exo decided)
5. A fix diff that touches the judge (probes, tests named in Proof, look.mjs assertions, review prompts) is discarded. (exo decided)
6. look.mjs gets a hard wall timeout from the kinds table; design-ui and critic prose name the ledger kind instead of their own counts. (exo decided)
7. A new check fails a numeric retry, round or attempt cap literal outside the kinds table in skills/, lib/, hooks/ and agents/ scripts, a numbered rerun, retry or round instruction in loaded prose that names no kind, and a kind with no consumer script or no test; it allows only by kind name. (exo decided)
8. `node lib/loop-budget.mjs --report <run dir>` prints rounds, wall and cost per kind; the run report includes it. (exo decided)
9. fix_after reads the fix-diff review's open fix count, and fix-diff-scope.mjs handles `+++ /dev/null`. (exo decided)
10. CONTRIBUTING.md gets one loop-budget section that replaces the scattered bound text; CHANGELOG gets one line per change under Unreleased. (exo decided)
11. Every refusing gate follows one contract: it returns every violation in one refusal; it repairs what is deterministic (default kind from agent type or brief shape, an absolute or uniquely resolvable path, an untracked absolute path under `.exo`); each refusal of the same dispatch is a ledger round of kind `refusal`, cap 2, after which the gate stops with one line naming every rule. (exo decided)
12. The new check also fails a refusing rule module that returns on its first violation, proven by a test that feeds a brief breaking every rule and asserts every rule is named. (exo decided)
13. Land per the repo workflow: worktree, squash to main, no push. (exo decided)

## Non-goals
- Benchmark and eval budgets (`eval`, `tbench`, `improve` in `lib/run-providers.json`) stay as they are.
- Harness `maxTurns` frontmatter in `agents/` stays; it is a turn limit, not a loop.

## Assumptions
- [code] Refusal contract (a) does not hold: `hooks/agent-effort.mjs:120` chains the denial checks with `??`, so the first failing rule wins and later ones are never reported.
- [code] Refusal contract (b) does not hold for kind: `unknownKindFields` in the same chain at `hooks/agent-effort.mjs:120` refuses rather than defaulting.
- [code] Refusal contract (c) does not hold: no refusal counter exists and `lib/loop-budget.mjs` is absent on main.
- [code] Gate start resets the repair counters and wall stamp (`skills/gate/scripts/gate-run.mjs:50-51`); the gate default wall is 900000 (`skills/gate/scripts/gate-constants.mjs:7`) against 1800000 in `skills/build/scripts/run-plan.mjs:349` and `skills/build/scripts/run-tail.mjs:133`.
- [code] `repairBound` and `attemptCap` live in `lib/run-providers.json` `defaults` and are read by `lib/run-outcomes.mjs:51-57`.

## Acceptance
- A gate re-entry on the same run continues the ledger round count instead of restarting it (Task 5).
- A fix round that does not lower the open count is reverted and prints `LOOP <kind> STOP no-progress` (Task 1, Task 5).
- One Agent dispatch that breaks three brief rules is refused once, naming all three; the third refusal of the same dispatch stops with `LOOP refusal STOP cap` (Task 2).
- look.mjs ends within its kinds-table wall timeout (Task 8).
- `node lib/loop-budget.mjs --report <run dir>` prints rounds, wall and cost per kind (Task 1, Task 7).
- `npm run check` fails a planted cap literal and a first-only rule module (Task 4, Task 11, Success criterion).

## Manual checks
- Run one plan with exo after this lands, then open its run report: you see one loop-budget table with rounds, wall time and cost for each loop kind.

## Plan basis
Repository: /Users/thomash/Documents/Code/personal/plugins/exo
Branch: spec/loop-budget
Worktree setup: none
Land gate: npm run validate:static
Land: local
Commit: feat(run): one loop budget for every review, repair, verify and refusal loop
Lint: none
App: none
Allow: none

## Success criterion
`npm run check && node --test tests/loop-budget.test.mjs tests/check-loop-kinds.test.mjs`
Product run: none (a Claude Code plugin with no bin or start script)

## Checkpoint
- Blocks first: Task 1.
- Parallel: Tasks 2, 3, 4, 5 and 6.
- Shared state: `lib/loop-kinds.json` is written by Task 1 only; `verify.mjs` is shared by Tasks 4 and 11 through a `Depends on:` edge; `lib/run-outcomes.mjs` and `lib/run-providers.json` change only in Task 10; `verify/budgets.mjs`, `verify/module-size-ceilings.txt` and `lib/model-kinds.json` order Tasks 2, 5, 7, 8, 9 and 10 by `Depends on:` edges.
- Smallest safe split: one task per loop owner, each with its own test.

## Tasks
### Task 1: feat(run): add the shared loop budget, kinds table and run ledger
Depends on: none | Files: `lib/loop-budget.mjs`, `lib/loop-kinds.json`, `tests/loop-budget.test.mjs` | Data: a kinds table keyed by kind name with cap, progress count and owner script, and a per-run TSV ledger in the run folder that prints `LOOP <kind> CONTINUE|STOP <reason>` and a `--report <run dir>` table | Risk: persisted format | Proof: node --test tests/loop-budget.test.mjs
### Task 2: fix(hooks): refuse an Agent brief once with every violation and count refusal rounds
Depends on: 1 | Files: `hooks/agent-effort.mjs`, `lib/brief-denials.mjs`, `tests/agent-effort.test.mjs`, `tests/brief-denials.test.mjs`, `verify/budgets.mjs`, `tests/guard-rules.test.mjs` | Data: one merged denial built from every rule result instead of the `??` chain, a default kind from agent type or brief shape, and ledger kind `refusal` keyed by dispatch | Risk: security boundary | Boundary: in a brief breaking one or more rules gets one refusal naming each | out the third refusal of one dispatch stops with `LOOP refusal STOP cap` | test tests/agent-effort.test.mjs | Proof: node --test tests/agent-effort.test.mjs tests/brief-denials.test.mjs
### Task 3: fix(build): report every land refusal at once under the refusal kind
Depends on: 1 | Files: `lib/refusal-handlers.mjs`, `lib/refusal-rules.mjs`, `lib/brief-path-rules.mjs`, `lib/size-denial.mjs`, `tests/refusal-handlers.test.mjs`, `tests/land-task-retry.test.mjs` | Data: one list of violations per refusal, ledger kind `refusal` per task | Risk: security boundary | Boundary: in a land report breaking several rules gets one refusal naming each | out the third refusal of one task stops with `LOOP refusal STOP cap` | test tests/refusal-handlers.test.mjs | Proof: node --test tests/refusal-handlers.test.mjs tests/land-task-retry.test.mjs
### Task 4: feat(verify): fail a refusing rule module that reports only its first violation
Depends on: 1 | Files: `verify/checks/refusal-all.mjs`, `verify.mjs`, `tests/check-refusal-all.test.mjs`, `tests/verify-single-read.test.mjs` | Data: a fixture brief that breaks every rule, fed to each refusing module, with every rule name expected in the refusal | Proof: node --test tests/check-refusal-all.test.mjs
### Task 5: fix(gate): run review and repair rounds on the run ledger
Depends on: 1 | Files: `tests/verify-repair.test.mjs`, `skills/gate/scripts/gate-repair.mjs`, `skills/gate/scripts/gate-run.mjs`, `skills/gate/scripts/gate-constants.mjs`, `skills/gate/scripts/repair-round.mjs`, `skills/gate/scripts/review-record.mjs`, `skills/gate/scripts/fix-diff-settle.mjs`, `skills/gate/scripts/gate-step.mjs`, `tests/gate-repair-round.test.mjs`, `tests/gate-step.test.mjs`, `verify/module-size-ceilings.txt`, `skills/gate/scripts/gate-next.mjs` | Data: ledger kinds `review`, `repair` and `gate-fail` in the run folder, no reset at gate start, a judge-touching fix diff discarded, and fix_after from the fix-diff review's open fix count | Proof: node --test tests/gate-repair-round.test.mjs tests/gate-step.test.mjs
### Task 6: fix(gate): read a deleted file in the fix diff scope
Depends on: none | Files: `skills/gate/scripts/fix-diff-scope.mjs`, `tests/fix-diff-scope.test.mjs` | Data: a `+++ /dev/null` header maps to the `---` path | Proof: node --test tests/fix-diff-scope.test.mjs
### Task 7: fix(build): bound headless attempts and review fixes by the loop budget
Depends on: 5 | Files: `skills/build/scripts/run-tail.mjs`, `skills/build/scripts/run-plan.mjs`, `skills/build/scripts/run-plan-attempts.mjs`, `skills/build/scripts/run-report.mjs`, `tests/run-tail-protocol.test.mjs`, `tests/run-plan-budget.test.mjs`, `verify/module-size-ceilings.txt`, `lib/loop-budget.mjs`, `lib/loop-kinds.json` | Data: ledger kinds `attempt` and `review-fix` with costUsd, the shared run wall budget in place of 1800000, and the `--report` table in the run report | Proof: node --test tests/run-tail-protocol.test.mjs tests/run-plan-budget.test.mjs
### Task 8: fix(design-ui): give look a wall timeout and the look and critic loops a kind
Depends on: 2, 7 | Files: `skills/build/scripts/look.mjs`, `tests/look-budget.test.mjs`, `skills/build/references/design-ui.md`, `skills/build/references/critic.md`, `skills/build/references/design-tasks.md`, `verify/budgets.mjs`, `verify/module-size-ceilings.txt`, `lib/model-kinds.json`, `tests/model-kinds.test.mjs`, `verify/model-kinds.mjs`, `lib/loop-budget.mjs`, `lib/loop-kinds.json` | Data: ledger kinds `look` and `critic` and a look wall timeout from the kinds table | Evidence: none (wording only names the ledger kind) | Proof: node --test tests/look-budget.test.mjs
### Task 9: docs(agents): name the loop kind in every numbered rerun instruction
Depends on: 2, 5, 8 | Files: `agents/build-task.md`, `agents/orchestrator.md`, `agents/task-runner.md`, `skills/build/SKILL.md`, `skills/build/references/agent-cases.md`, `skills/gate/references/repair.md`, `lib/model-kinds.json`, `tests/model-kinds.test.mjs`, `verify/model-kinds.mjs`, `verify/module-size-ceilings.txt`, `verify/budgets.mjs`, `verify/checks/reference-tables.mjs`, `tests/agent-effort.test.mjs`, `tests/benchmark-agent-tier-task-runner.test.mjs`, `tests/benchmark-flow-unit.test.mjs`, `tests/build-no-fork.test.mjs`, `tests/gate-step.test.mjs`, `tests/implementing-push-gate.test.mjs`, `tests/skill-text.test.mjs`, `tests/agents.test.mjs`, `tests/guard-rules.test.mjs` | Data: each rerun, retry or round line names its kind instead of a number, with `agents/build-task.md` trimmed to stay under its body cap | Evidence: none (wording only names the ledger kind) | Proof: node -e "process.exit(/Round: n\/3/.test(require('fs').readFileSync('agents/orchestrator.md','utf8'))?1:0)"
### Task 10: refactor(run): delete the old cap constants
Depends on: 5, 7, 8, 9 | Files: `lib/run-outcomes.mjs`, `lib/run-providers.json`, `hooks/run-no-wait.mjs`, `tests/run-outcomes.test.mjs`, `tests/run-no-wait.test.mjs`, `tests/run-providers-catalog.test.mjs`, `tests/context-limit.test.mjs`, `tests/intake-bound.test.mjs`, `verify/budgets.mjs`, `lib/refusal-handlers.mjs`, `skills/build/scripts/land-report.mjs`, `skills/build/scripts/wait-report.mjs`, `skills/gate/scripts/gate-decide.mjs`, `skills/gate/scripts/merge-reviews.mjs`, `skills/gate/scripts/repair-round.mjs`, `tests/gate-step.test.mjs`, `skills/build/scripts/run-plan-provider.mjs` | Data: outcome lines read their cap from the kinds table, and `repairBound`, `attemptCap` and `BLOCK_LIMIT` are gone | Red: none (behavior unchanged; the caps now come from the kinds table) | Proof: node --test tests/run-outcomes.test.mjs
### Task 11: feat(verify): fail a loop cap or rerun count outside the kinds table
Depends on: 2, 3, 4, 5, 7, 8, 9, 10 | Files: `verify/checks/loop-kinds.mjs`, `verify.mjs`, `tests/check-loop-kinds.test.mjs`, `tests/verify-single-read.test.mjs`, `skills/build/scripts/run-session.mjs`, `skills/build/references/fix-class.md`, `skills/build/references/task-mode.md`, `skills/configure/SKILL.md`, `skills/edit-skills/SKILL.md`, `skills/build/review-fixer-prompt.md`, `skills/build/run-task-prompt.md`, `lib/loop-kinds.json`, `lib/loop-budget.mjs`, `verify/budgets.mjs` | Data: a scan of script literals and loaded prose against `lib/loop-kinds.json`, allowed only by kind name, and every kind needing a consumer and a test | Proof: node --test tests/check-loop-kinds.test.mjs
### Task 12: docs(contributing): describe the loop budget in one section
Depends on: 11 | Files: `CONTRIBUTING.md`, `CHANGELOG.md` | Data: one loop-budget section replacing the scattered bound text, and one Unreleased line per change | Proof: node -e "process.exit(/^## Loop budget/m.test(require('fs').readFileSync('CONTRIBUTING.md','utf8'))?0:1)"
