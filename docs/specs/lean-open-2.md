## Goal
Eight open points of run lean-open are closed or made measurable: land refreshes a stale behaviour file, the T rule range is true, the criterion timeout kills its children, the unwired needs-input state is gone, every task worktree gets .env, land warns about a sibling task's file, two loose test patterns are exact, and the routing harness can measure the three routing lines.

## Constraints
Every builder reads `lib/references/lean.md` (guarded by `tests/lean-principles.test.mjs`) and this block. Background: `.exo/lean-open/progress.md`, `docs/specs/lean-open.md:78-84`, `.exo/kept/lean-open-spec/review-branch.md:14-37`, `CONTRIBUTING.md:185`, `.claude/landing.md`.
- Lean principles per task: (1) name the assumptions and, where a point reads two ways, the reading taken (see Decisions); (2) make the smallest change that does the point, with no option, abstraction or error handling nobody asked for; (3) touch only the lines the point needs, leave nearby code alone and report other dead code instead of removing it; (4) name one pass-or-fail check before the first edit, the red test and then the Proof.
- No new hook, no extra module loaded by a hook, no growth of `hooks/session-rules.md` or `hooks/session-routing.md`; `node benchmarks/lean-guards-compare.mjs` exits 0 with bytes <= 2666 and modules <= 77.
- No weakened test, no code comment, no personal data, no mention of an AI in a commit or file, no force.
- Each task shows its test red before the change, in a `git archive HEAD` copy under /tmp; Task 4 removes a branch and Task 6 is test-only, and each says why red is not possible.
- Tests run as `node --test --test-timeout=60000 <file>`; a hanging test is a finding.
- `CHANGELOG.md`, `verify/module-size-ceilings.txt` and `docs/behaviour/*.md` are in no task's Files; `docs/behaviour/` is current at the plan commit. A builder whose land gate fails on a file outside Files fixes that itself, changing only its own row or line, and runs `node skills/spec/scripts/behaviour.mjs` last. The lead writes the CHANGELOG lines at the squash.
- No two tasks share a file in Files (tests and generated files included). Tasks 1 to 8 are independent and build at once, each in its own worktree; Task 9 follows Tasks 4 and 8.

## Verdict
Verdict: go
Objection: point 1 may regress land speed if land runs behaviour.mjs on every task; Task 1 keeps the rerun to the stale case.

## Acceptance
- Task 1: a land whose behaviour file is stale refreshes it, stages it and lands; a land with a current file runs no refresh.
- Task 2: `.claude/CLAUDE.md` and `docs/principles/agent.md` name the T range that `hooks/session-rules.md` holds.
- Task 3: after the criterion timeout no child of the criterion command is alive, and `EXO_CRITERION_TIMEOUT_MS` is read through `environmentMs`.
- Task 4: `END_STATES` holds two names and no code names the needs-input state.
- Task 5: a land that leaves a path of another open task unstaged prints a warning naming the path and that task, and lands.
- Task 6: the two tests match the exact refusal text.
- Task 7: `node benchmarks/routing.mjs` runs the paired arm under `--dry-run` with its sessions and projected cost, and starts no session.
- Task 8: a task slot, a setup worktree and a conflict tree hold the main checkout's gitignored `.env` files, and land never stages one.
- Task 9: `CONTRIBUTING.md` describes the end states and the `.env` copy as Tasks 4 and 8 left them.
- Success criterion: `npm run check` ends `SUMMARY` with `FAIL=0 WARN=0 UNRUN=0`.
- Success criterion, second done line: `node benchmarks/lean-guards-compare.mjs` exits 0 with bytes <= 2666 and modules <= 77.

## Manual checks
- None.

## Plan basis
Repository: /Users/thomash/Documents/Code/personal/plugins/exo/.claude/worktrees/lean-open-2-spec
Branch: spec/lean-open-2
Worktree setup: none
Land gate: npm run validate:static
Land: local
Commit: fix(lean): close the open points of lean-open
Lint: none
Allow: none

## Success criterion
`npm run check`
Red: none (each task Proof proves its own red)

## Checkpoint
- Blocks first: none.
- Parallel: Tasks 1, 2, 3, 4, 5, 6, 7 and 8.
- Shared state: none.
- Smallest safe split: one task per point; points 4 and 5 both need `CONTRIBUTING.md`, so its text is Task 9.

## Decisions
- Task 1: option (b), land reruns `skills/spec/scripts/behaviour.mjs` only when the behaviour file is stale, and stages the result in `skills/build/scripts/land-stage.mjs:10-14`. Settled by plan-notes point 1: behaviour.mjs reads only tracked briefs (`lib/shipped-briefs.mjs:25-28`), so no cause fix (a) was found to size. Reading taken: regenerate on stale (A), not hunt the cause (B). Assumption: the gate runs on the working tree. The builder first confirms the stale cause from the refusal line (`verify/checks/behaviour-current.mjs:17`) and names it in the report. The rerun stays on the stale case only (the Verdict objection). Red: `tests/land-behaviour-refresh.test.mjs` fails on base with "Land gate failed".
- Task 2: fix the docs to the range in `hooks/session-rules.md` (T1 to T4), not add a T5 rule. Settled by `hooks/session-rules.md:4-8`. Red: one new test in `tests/hooks.test.mjs` near :411 that both files name a T range present in session-rules.md; it fails on base because both say T5.
- Task 3: kill the child tree with `killTree` (`lib/process-tree.mjs:11`) and read the timeout through `environmentMs` (`lib/script-flags.mjs:41`) inside `checkCriterionRuns`, so a test can set it. Reading taken: kill the group (A), not only the env convention (B). Red: criterion `sh -c 'sleep 30 & echo $! > pidfile; wait'` with `EXO_CRITERION_TIMEOUT_MS=300`; after the check the background pid must be dead; alive on base. Open: whether `lib/run-check.mjs` already kills the tree; the builder reads it first and reuses it if so. One test per cause in `tests/plan-check-run-commands.test.mjs`; never waits 120 s.
- Task 4: remove the `needsInput` end state, since wiring has no signal source (`skills/gate/scripts/repair-round.mjs` has none) and removal is about 25 lines. Removes `lib/loop-budget.mjs:102,115,126-127`, `lib/run-outcomes.mjs:35`, the `needs-input` entry in `lib/refusal-handlers.mjs:6`, and tests `tests/loop-budget.test.mjs:92-97` and `tests/loop-end-states.test.mjs:8,26-29`; CHANGELOG history lines stay and `CONTRIBUTING.md` is Task 9. Red: none (a removed branch cannot fail first); its proof is the two edited tests passing and `END_STATES` holding two names.
- Task 8: task worktrees get `.env` (exo decided): drop `{ env: false }` in `open-slots.mjs:90`, `setup.mjs:31` and `conflict-wave.mjs:58`. Settled by the rule in `docs/specs/lean-native.md:2,10` (every new worktree gets the main checkout's gitignored `.env` files) and by commits d8327eeb1 and d388cba14 giving no reason for the option, with no entry in `benchmarks/speed-ledger.md`. `lib/red-green.mjs:156` keeps it. A `.env` file is never staged: `skills/build/scripts/land-paths.mjs:10` protects `.env(\.|$)`. Red: a new assertion in `tests/slot-env.test.mjs` that a slot has the main checkout's `.env`; fails on base.
- Task 9: prose only, after Tasks 4 and 8: drop the needs-input text at `CONTRIBUTING.md:204,208` and make `CONTRIBUTING.md:185` say only a red-green tree passes `env: false`. Red: `grep -q "one of two states named by" CONTRIBUTING.md` exits 1 on base, where line 208 says three states.
- Task 5: warn, never stage (user decision). The owner number at `skills/build/scripts/land-paths.mjs:64-66` is kept in a path-to-task map and a second line in the format of `:56` names the path and the owner, e.g. "[WARN] Task 1 left `src/claimed.js` for open Task 2"; the file stays unstaged and the land goes on. `land-refusals.mjs` is in Files only if the call at :159 must pass the map. Red: `tests/land-amend.test.mjs` near :45 asserts stdout matches `/claimed\.js.*Task 2/`; base prints nothing. Open: the warning may repeat at check time (`land-check.mjs:35`); both call sites share the predicate and the builder reports it.
- Task 7: build code only and start no paid session; `hooks/session-routing.md` is not in Files and is not edited. Source: `.exo/lean-open-2/measure-price.md:16-37`, option B1. Add to the routing harness two arms, "hook" and "hook minus lines 4 to 6 of hooks/session-routing.md", on the 35 prompts those lines can affect (32 find-cause, 3 known-cause), paired per prompt: a `no-failure-lines` variant in `benchmarks/variants.mjs`, a `--variant` flag in `benchmarks/routing.mjs` giving the arm its own plugin copy, and the paired difference with its 95% interval and minimum detectable effect through `powerLine` (`lib/eval-stats.mjs:235`) in `benchmarks/routing-stats.mjs`. Proof is a test with a stubbed session in new `tests/routing-variant.test.mjs`, plus `--dry-run` printing sessions and projected cost (140 sessions at 2 runs, 70 at 1 run) under the existing cap flag `--max-budget-usd` (`benchmarks/routing.mjs:43`), default at most 4.20. Rule for the lead's later paid run: keep the lines when the 95% interval of the paired difference is above 0; remove them when the interval sits inside +-0.14 with a point estimate of 0 or less; otherwise not shown and the lines stay. Line 6 is not testable in the harness and stays. Open: the builder confirms the Files list and that no existing routing test needs an edit; if one does, it is reported as BLOCKED, not shared.
- Task 6: test-only. Tighten `/report/i` in `tests/land-task-retry.test.mjs:45-59` to `/no build report at /` (text of `skills/build/scripts/land-report.mjs:53`) and `/^REFUSED 1\b/` in `tests/land-slot.test.mjs:73-80` to the text of `skills/build/scripts/land-slot.mjs:23` (`REFUSED 1: <message>` then `slot ... kept`). Weaken nothing. Red: in a `git archive HEAD` copy under /tmp, mutate the production message; the old pattern passes and the new one fails. Open: the exact refusal reason in the land-slot fixture; the builder reads `tests/land-slot.test.mjs` for it.

## Non-goals
Reported only, not changed:
- The T1-T4 rules in `hooks/session-rules.md` (point 8): a measurement costs about $4.20 and needs a new 90-line harness plus 70 hand-written prompts, with a weak removal verdict for T1 and T4; the lead decided no measurement.
- `skills/build/scripts/land-refusals.mjs:166-172` bare catch.
- `skills/build/scripts/land-paths.mjs:54-55` name `kept`.
- Dynamic imports in `tests/land-task-retry.test.mjs:46-49`.
- Test gap at `tests/land-task-commit.test.mjs:77-85`.
- `hooks/handoff-stub.md:1`.
- Stray spaces and the machine-dependent red in `tests/checkout.test.mjs`.
- The bundled `CHANGELOG.md:31` bullet.
- `env: false` in `lib/red-green.mjs:156`, `benchmarks/sweep.mjs:283`, `benchmarks/bisect-repo.mjs:32` and `tests/checkout.test.mjs:79`.
- The lean-principles check does not read `hooks/session-rules.md`.

## Tasks
### Task 1: fix(build): rerun the behaviour file at land when it is stale
Depends on: none | Files: `skills/build/scripts/land-stage.mjs`, `tests/land-behaviour-refresh.test.mjs` | Data: no new structure; stageCandidate writes and stages the generated behaviour files only when behaviourDrift is stale | Proof: node --test --test-timeout=60000 tests/land-behaviour-refresh.test.mjs
### Task 2: docs(rules): name the T range that session-rules.md holds
Depends on: none | Files: `.claude/CLAUDE.md`, `docs/principles/agent.md`, `tests/hooks.test.mjs` | Data: two prose mentions changed from T1 to T5 to T1 to T4 | Proof: node --test --test-timeout=60000 tests/hooks.test.mjs
### Task 3: fix(plan-check): kill the criterion's child tree on timeout
Depends on: none | Files: `skills/spec/scripts/plan-check-loop.mjs`, `tests/plan-check-run-commands.test.mjs` | Data: no new structure; the timeout is read per call through environmentMs and the child tree is killed with killTree | Proof: node --test --test-timeout=60000 tests/plan-check-run-commands.test.mjs
### Task 4: fix(loop-budget): remove the unreached needs-input end state
Depends on: none | Files: `lib/loop-budget.mjs`, `lib/run-outcomes.mjs`, `lib/refusal-handlers.mjs`, `tests/loop-budget.test.mjs`, `tests/loop-end-states.test.mjs` | Data: END_STATES shrinks to two names | Red: none (a removed branch cannot fail first; the two edited tests pass and END_STATES holds two names) | Proof: node --test --test-timeout=60000 tests/loop-budget.test.mjs tests/loop-end-states.test.mjs
### Task 5: fix(land): warn when a path belongs to another open task
Depends on: none | Files: `skills/build/scripts/land-paths.mjs`, `skills/build/scripts/land-refusals.mjs`, `tests/land-amend.test.mjs` | Data: a path-to-owner map built where siblingWorkOf reads the other task number | Proof: node --test --test-timeout=60000 tests/land-amend.test.mjs
### Task 6: test(land): match the exact refusal text in two tests
Depends on: none | Files: `tests/land-task-retry.test.mjs`, `tests/land-slot.test.mjs` | Data: two regular expressions changed in existing tests | Red: none (a loose pattern cannot fail first; the builder shows a mutated production message that the old pattern passes and the new one fails in a git archive copy under /tmp) | Proof: node --test --test-timeout=60000 tests/land-task-retry.test.mjs tests/land-slot.test.mjs
### Task 7: feat(benchmarks): add a paired routing arm without lines 4 to 6
Depends on: none | Files: `benchmarks/variants.mjs`, `benchmarks/routing.mjs`, `benchmarks/routing-stats.mjs`, `tests/routing-variant.test.mjs`, `verify/module-size-ceilings.txt` | Data: one variant entry and a paired per-prompt difference with its interval, no new persisted format | Proof: node --test --test-timeout=60000 tests/routing-variant.test.mjs
### Task 8: fix(build): give every task worktree its .env
Depends on: none | Files: `skills/build/scripts/open-slots.mjs`, `skills/build/scripts/setup.mjs`, `skills/build/scripts/conflict-wave.mjs`, `tests/slot-env.test.mjs` | Data: three callers lose the env option | Proof: node --test --test-timeout=60000 tests/slot-env.test.mjs
### Task 9: docs(contributing): match the end states and the .env copy
Depends on: 4, 8 | Files: `CONTRIBUTING.md` | Data: three prose lines changed | Proof: grep -q "one of two states named by" CONTRIBUTING.md
