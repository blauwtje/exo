# Karpathy-derived ideas

## Goal
Eleven ranked ideas from the Karpathy research land as tested, offline-provable modules and wording changes, and a repeat of the flow-unit baseline shows their effect on cost and time.

## Verdict
Verdict: go
Objection: each idea gain is unproven until a paid run; the static proofs show only that the mechanism works, so the closing sweep decides whether any change regresses cost or pass rate.

## Decisions
1. One task per idea, each with a static Proof, because paid runs are one closing task and the Land gate stays cheap (exo decided).
2. K13 ships as a pure verdict function plus a zero-cost replay over stored ledger cells, not a new paid cell (exo decided).
3. K2 builds the ablation variants and a lines-removed readout without deleting any part; a deletion needs a later paid verdict (exo decided).
4. K7 extends the existing orchestrator evidence check to figures instead of adding a second check (exo decided).
5. K6 is a command hook that compares routes with no model call (exo decided).
6. K9 ships the scripted changed-file tree only, with no HTML (exo decided).
7. K10 is a capped map module that stays off by default (exo decided).
8. K1 harvests cells from sessions still on disk and scrubs personal data before writing a fixture (exo decided).
9. The plan file is force-added because docs/ is ignored (exo decided).

## Non-goals
- A paid sweep per idea, except the closing flow-unit repeat in Task 12; no task but Task 12, which adds `benchmarks/results/2026-11-08-karpathy-flow-unit-after.md`, touches `benchmarks/results/`.
- Dropped ideas K4, K5, K11 and K15 stay out.

## Assumptions
- [code] flow-unit baseline at 5033ef24 is $0.418 mean with sd 0.187 and 105.3 s with sd 45.1, 3 of 3 pass (.exo/karpathy/baseline.md).
- [assume] The after-sweep at n=3 cannot separate a cost change under about 45 percent, so it reports a regression screen, not a win.

## Acceptance
- Each of Tasks 1 to 11 has a test that its Proof runs.
- The Success criterion runs the full check once.
- Task 12 writes the after-sweep to `.exo/karpathy/sweep-results-after` and compares it to the baseline numbers.

## Manual checks
- Open `.exo/karpathy/sweep-results-after` and read the pass count; it should be 3 of 3.

## Plan basis
Repository: .
Branch: spec/karpathy
Land gate: npm run validate:static
Land: local
Commit: feat(exo): add the Karpathy-derived ideas
Lint: none
App: none
Allow: none

## Success criterion
`npm run check && node benchmarks/sweep.mjs --set flow --cells flow-unit --repeat 3 --confirm --results .exo/karpathy/sweep-results-after`
Red: none (the check passes on the base; the tasks add modules and tests that keep it green)
Product run: none (a plugin source repo, no bin or start script)

## Checkpoint
- Blocks first: none.
- Parallel: none.
- Shared state: CONTRIBUTING.md, lib/model-kinds.json, benchmarks/variants.mjs, agents/orchestrator.md and hooks/session-routing.md, so the tasks run in series.
- Smallest safe split: one task per idea with its own test file.
## Tasks
### Task 1: feat(benchmarks): judge a speed idea by two-cell frontier endpoints
Depends on: none | Files: `benchmarks/frontier-verdict.mjs`, `benchmarks/improve-speed.mjs`, `benchmarks/speed-ledger.mjs`, `tests/benchmark-frontier-verdict.test.mjs`, `tests/improve-speed.test.mjs`, `CONTRIBUTING.md` | Data: a verdict function over two cells of cost and wall pairs, plus a replay count of flipped promote verdicts | Proof: node --test tests/benchmark-frontier-verdict.test.mjs
### Task 2: feat(research): check each cited url and quote in a research result
Depends on: 1 | Files: `lib/check-citations.mjs`, `agents/research-worker.md`, `tests/check-citations.test.mjs`, `lib/model-kinds.json`, `tests/model-kinds.test.mjs`, `verify/model-kinds.mjs`, `CONTRIBUTING.md` | Data: a list of url and quote pairs with a verified, missing or unreachable status | Evidence: none (the wording only tells the worker to run the checker; the checker has its own test) | Proof: node --test tests/check-citations.test.mjs
### Task 3: feat(benchmarks): add an exo-nano arm that strips hooks and the orchestrator
Depends on: 2 | Files: `benchmarks/variants.mjs`, `benchmarks/tasks.mjs`, `tests/benchmark-nano-variant.test.mjs`, `verify/module-size-ceilings.txt` | Data: one more variant entry with a remove list and one more arm name | Proof: node --test tests/benchmark-nano-variant.test.mjs
### Task 4: feat(benchmarks): turn graded real sessions into replay cases
Depends on: 3 | Files: `benchmarks/harvest-cases.mjs`, `benchmarks/replay/grade.mjs`, `tests/benchmark-harvest-cases.test.mjs` | Data: a case folder per failed session with personal data scrubbed | Proof: node --test tests/benchmark-harvest-cases.test.mjs
### Task 5: feat(evidence): require a source beside every figure in a worker report
Depends on: 4 | Files: `lib/evidence-rules.mjs`, `agents/orchestrator.md`, `tests/evidence-figures.test.mjs`, `lib/model-kinds.json`, `CONTRIBUTING.md`, `tests/agent-effort.test.mjs`, `tests/model-kinds.test.mjs`, `verify/model-kinds.mjs`, `CONTRIBUTING.md` | Data: a rule that flags a cost, count or wall figure with no path or command beside it | Evidence: none (the wording names the new rule; a seeded fixture test proves the rule) | Proof: node --test tests/evidence-figures.test.mjs
### Task 6: feat(hooks): nudge toward a fresh session when the topic switches
Depends on: 5 | Files: `hooks/context-limit.mjs`, `lib/topic-switch.mjs`, `tests/topic-switch.test.mjs`, `CONTRIBUTING.md`, `tests/context-limit.test.mjs`, `verify/budgets.mjs` | Data: the existing PreToolUse `Skill` path of `hooks/context-limit.mjs` compares the lead's skill topic with the session topic, so no new hook entry runs on every prompt | Evidence: none (the code path is deterministic and its test seeds both topics) | Proof: node --test tests/topic-switch.test.mjs
### Task 7: feat(routing): score routing on dictated prompts beside typed ones
Depends on: 6 | Files: `benchmarks/routing.mjs`, `benchmarks/routing/prompts.json`, `tests/benchmark-routing-dictated.test.mjs`, `tests/routing-check.test.mjs`, `tests/routing-eval.test.mjs`, `tests/routing-near-miss.test.mjs`, `tests/routing-prompts.test.mjs`, `benchmarks/routing-spoken.mjs`, `verify/module-size-ceilings.txt`, `CONTRIBUTING.md` | Data: a spoken flag on prompt entries and an accuracy split by it | Proof: node --test tests/benchmark-routing-dictated.test.mjs
### Task 8: feat(benchmarks): ablate one hook, rule or reference per improve round
Depends on: 7 | Files: `benchmarks/ablate.mjs`, `benchmarks/variants.mjs`, `tests/benchmark-ablate.test.mjs` | Data: one variant per plugin part with the lines it removes | Proof: node --test tests/benchmark-ablate.test.mjs
### Task 9: feat(draw): print a changed-file tree for a large branch
Depends on: 8 | Files: `lib/draw.mjs`, `skills/gate/SKILL.md`, `tests/draw-tree.test.mjs` | Data: an indented tree string built from a list of changed paths | Evidence: none (the wording only names the tree; the tree has its own test) | Proof: node --test tests/draw-tree.test.mjs
### Task 10: feat(map): fan a bulk item list out to a cheap model with a cost cap
Depends on: 9 | Files: `lib/map.mjs`, `agents/orchestrator.md`, `skills/watch/SKILL.md`, `tests/map.test.mjs`, `lib/model-kinds.json`, `CONTRIBUTING.md`, `tests/agent-effort.test.mjs`, `tests/model-kinds.test.mjs`, `verify/model-kinds.mjs`, `CONTRIBUTING.md` | Data: a list of items mapped to results with a spend cap that stops the fan-out | Evidence: none (the wording points to the module; the module has its own test) | Proof: node --test tests/map.test.mjs
### Task 11: feat(benchmarks): add a long-horizon flow-large cell
Depends on: 10 | Files: `benchmarks/cell-steps.json`, `benchmarks/sweep-cells.mjs`, `benchmarks/sweep-fixtures.mjs`, `benchmarks/sweep.mjs`, `verify/module-size-ceilings.txt`, `benchmarks/sweep-large.mjs`, `benchmarks/sweep-plan-text.mjs`, `benchmarks/sweep-prepare.mjs`, `tests/benchmark-flow-large.test.mjs`, `tests/benchmark-sweep-fixtures.test.mjs` | Data: a cell entry above four build tasks, run only with --full | Proof: node --test tests/benchmark-flow-large.test.mjs
### Task 12: test(benchmarks): repeat the flow-unit baseline after the changes
Depends on: 11 | Files: `benchmarks/results/2026-11-08-karpathy-flow-unit-after.md` | Data: the repeat command `node benchmarks/sweep.mjs --set flow --cells flow-unit --repeat 3 --confirm --results .exo/karpathy/sweep-results-after`, run by the Success criterion outside the sandbox, whose summary is compared with the baseline of $0.418 (sd 0.187), 105.3 s (sd 45.1), 3 of 3 pass | Red: none (a measurement, not a behavior change) | Literals: none (the baseline numbers come from baseline.md) | Proof: node --check benchmarks/sweep-cells.mjs
### Task 13: docs(benchmarks): record the new benchmark entries in the contributor docs and locks
Depends on: 12 | Files: `CONTRIBUTING.md`, `verify/budgets.mjs` | Data: one line per new benchmark entry in CONTRIBUTING.md and any lock constant the earlier tasks move | Red: none (documentation and a lock value, not a behavior change) | Literals: none | Proof: node --check verify/budgets.mjs
