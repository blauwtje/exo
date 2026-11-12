## Goal
Four defects found while landing lean-open-2 are fixed at their cause: a run checkout under `.claude/worktrees` builds its waves in parallel, a land that amends the plan leaves no pending edit that blocks the next land, the land gate judges the committed tree and not the builder's fuller working tree, and a test that names a module by a relative import or a `${root}` template is found as its covering test.

## Constraints
Every builder reads `lib/references/lean.md` (guarded by `tests/lean-principles.test.mjs`) and this block. Background: `docs/specs/lean-open-2.md`, `.claude/landing.md`.
- Lean principles per task: (1) name the assumptions and, where a point reads two ways, the reading taken (see Decisions); (2) make the smallest change that does the point, with no option, abstraction or error handling nobody asked for; (3) touch only the lines the point needs, leave nearby code alone and report other dead code instead of removing it; (4) name one pass-or-fail check before the first edit, the red test and then the Proof.
- No new hook, no extra module loaded by a hook, no growth of `hooks/session-rules.md` or `hooks/session-routing.md`.
- No paid session, no `claude -p`, no weakened test, no code comment, no personal data, no mention of an AI tool or author in a commit or file, no force.
- Each fix task shows its test red before the change, in a `git archive HEAD` copy under /tmp; a task that cannot show red says why.
- Tests run as `node --test --test-timeout=60000 <file>`; a hanging test is a finding.
- `CHANGELOG.md` is in no task's Files; the lead writes it. A builder that moves a row of `verify/module-size-ceilings.txt` or a `docs/behaviour/` line for its own file fixes that row or line itself and runs `node skills/spec/scripts/behaviour.mjs` last.
- No two tasks of the same wave share a file; Task 3 follows Task 2 because both change `tests/land-slot.test.mjs`.

## Verdict
Verdict: go
Objection: point (e) may have no route that keeps the routing check as strict as it is; then (e) gets no task.

## Acceptance
- Task 1: a run checkout under `.claude/worktrees` that is the plan's `Repository:` forms a parallel wave; a checkout under `.claude/worktrees` that is not the `Repository:` still builds one task at a time.
- Task 2: after a land that amends the plan, the run checkout shows no pending plan edit and the next slot land does not refuse `NEWPATH`.
- Task 3: a slot land that leaves a sibling-owned file unstaged runs the land gate on the committed tree and does not report a cached pass.
- Task 4: `coveringTests('.', ['benchmarks/routing.mjs'])` lists `tests/routing-eval.test.mjs`.
- Success criterion: `npm run check` ends `SUMMARY` with `FAIL=0 WARN=0 UNRUN=0`.

## Manual checks
- None.

## Plan basis
Repository: /Users/thomash/Documents/Code/personal/plugins/exo/.claude/worktrees/lean-open-3-spec
Branch: spec/lean-open-3
Worktree setup: none
Land gate: npm run validate:static
Land: local
Commit: fix(lean): close the free open points of lean-open-2
Lint: none
Allow: none

## Success criterion
`npm run check`
Red: none (each task Proof proves its own red)

## Checkpoint
- Blocks first: none.
- Parallel: Tasks 1, 2 and 4.
- Shared state: `tests/land-slot.test.mjs` (Tasks 2 and 3), so Task 3 follows Task 2.
- Smallest safe split: one task per cause; Tasks 2 and 3 are chained for the shared test file.

## Decisions
- Task 1, point (a): `isolatedCheckout(root)` (`lib/plan-waves.mjs:51-53`) is true for any realpath ending `.claude/worktrees/<name>`, and `skills/build/scripts/next-task-report.mjs:41` and `skills/build/scripts/land-output.mjs:20` then pass `worktreeSetup=null` to `nextWave` (`lib/plan-waves.mjs:14-27`), which forms a one-task wave even in the run checkout, whose slots `lib/checkout.mjs:29-31` can make. Fix as the handover proposes: a checkout counts as isolated only when it is not the plan's `Repository:` (`frame.repository`, in scope in both callers), so `isolatedCheckout(root, repository)` and no new value. Assumption: a harness-made delegate checkout differs from `Repository:`; whether an EnterWorktree session started inside the run worktree is confined is settled by a setting and the builder cannot test the harness. Red: a new test in `tests/next-task.test.mjs` with a plan whose `Repository:` equals a root under `.claude/worktrees` forms a wave; one task on base. `git show e058218b1 -- tests/next-task.test.mjs` shows the existing isolated-checkout test to keep green.
- Task 2, point (b): `skills/build/scripts/land-task.mjs:55` calls `amendOutsideFiles` (`skills/build/scripts/land-amend.mjs:56-60`), which writes the widened plan to `context.planPath` in the run checkout; `landSlot` (`skills/build/scripts/land-slot.mjs:60-66`) refuses `NEWPATH` on any `git status --porcelain` line of the run checkout not in the wave baseline, so the pending plan edit blocks the next slot land and the lead. Fix the cause: `amendOutsideFiles` commits its plan edit in the run checkout (the lead did this by hand in 36559fd11), so nothing stays pending. The baseline route (`land-slot.mjs` ignores the land's own plan edit) is taken only if the plan file cannot be committed there (for example it is untracked or ignored in the run checkout); then `skills/build/scripts/land-slot.mjs` joins Files and the builder names the reason in its report. Red: a new test in `tests/land-slot.test.mjs`, two slots, the first lands with an `AMEND` line, the second must not refuse `NEWPATH`; it refuses on base.
- Task 3, point (c): `skills/build/scripts/land-paths.mjs:82-84` (`siblingFile`/`siblingWork`) removes from `outside` a path an open sibling task lists in Files; `land-stage.mjs:17` stages only `outside`, so the file is not in the candidate commit but stays in the slot working tree (`land-slot.mjs:79` cherry-picks only HEAD). `lib/check-cache.mjs:28-49` `workingTreeKey` keys the tree of index plus `git add -u` plus untracked, which is the builder's fuller tree, so `treePass` (`:67-71`) hits the builder's logged pass and `skills/build/scripts/land-gate.mjs:55-59` reports "skipped: its log shows a clean pass on this tree" while the commit lacks the file (it dropped the `verify/module-size-ceilings.txt` row). Fix: in `land-gate.mjs` `runLandGate` call `runCheck(..., { fresh: true })` when `git status --porcelain`, ignoring `.exo/`, is non-empty after the candidate commit, so a log of a fuller tree is never reused. Reading taken: the smallest fix (fresh run), not a gate in a temporary checkout of the candidate tree. Unsure: which filter dropped that very row (`siblingWork`, a missing `git add`, or another); the land's `[WARN] ... left ... for open Task` line or `git status` of the kept slot settles it, and the fix holds for all three because it keys on the dirty tree. Red: a new test in `tests/land-slot.test.mjs`, a slot land with an unstaged sibling-owned file, asserts the gate is not skipped as cached; it is skipped on base. `tests/land-gate-summary.test.mjs` is the second test to keep green.
- Task 4, point (d): `lib/covering-tests.mjs:39` (`literalsOf`) and `:50` (`readsAny`) compare string literals verbatim with the repo-relative wanted set; `tests/routing-eval.test.mjs:7` imports `'../benchmarks/routing.mjs'` and uses `` `${root}benchmarks/routing.mjs` `` (lines 106, 130, 192, 199, 228), and neither equals `benchmarks/routing.mjs`, so the test is never found. The land is not at fault (`land-stage.mjs:23-30` passes what the lookup returns). Fix: `literalsOf` also yields each literal with a `${...}` prefix stripped and, for a literal starting `./` or `../`, resolved against `tests/`. Red: a new test in `tests/covering-tests.test.mjs` that a fixture test importing `../x/mod.mjs` and one using `` `${root}x/mod.mjs` `` are both found for `x/mod.mjs`; neither is found on base.
- Point (e) is not planned and has no task and no open point: the paid arm `no-failure-lines` removed lines 4, 5 and 6 of `hooks/session-routing.md` (`benchmarks/variants.mjs:34-39`), while f0f8e0cdc removes lines 4-5 and keeps line 6, so the landed text equals no measured arm, and a check that accepted the paired result would pass unmeasured text. No cheaper route keeps `verify/checks/routing.mjs` as strict (it fails on any hash difference). It stays open outside this plan at the price of a `--full` run, 2304 sessions, $69.21; the user decides on the spend.
- No paid session in any task.

## Tasks
### Task 1: fix(build): form a wave in the run checkout under .claude/worktrees
Depends on: none | Files: `lib/plan-waves.mjs`, `skills/build/scripts/next-task-report.mjs`, `skills/build/scripts/land-output.mjs`, `tests/next-task.test.mjs` | Data: isolatedCheckout takes the plan's Repository and is false when the checkout equals it | Proof: node --test --test-timeout=60000 tests/next-task.test.mjs
### Task 2: fix(build): leave no pending plan edit after an amending land
Depends on: none | Files: `skills/build/scripts/land-amend.mjs`, `tests/land-slot.test.mjs`, `tests/land-amend.test.mjs` | Data: no new structure; the widened plan is committed in the run checkout right after it is written | Proof: node --test --test-timeout=60000 tests/land-slot.test.mjs
### Task 3: fix(build): judge the committed tree at the land gate
Depends on: 2 | Files: `skills/build/scripts/land-gate.mjs`, `tests/land-slot.test.mjs`, `tests/land-gate-summary.test.mjs` | Data: no new structure; runCheck runs fresh when the tree is dirty after the candidate commit | Proof: node --test --test-timeout=60000 tests/land-slot.test.mjs
### Task 4: fix(covering): find a test that names a module by a relative import or a template
Depends on: none | Files: `lib/covering-tests.mjs`, `tests/covering-tests.test.mjs`, `CONTRIBUTING.md` | Data: CONTRIBUTING.md line 151 names the two extra forms; no new structure; literalsOf also yields the `${...}`-stripped and tests/-resolved forms of a literal | Proof: node --test --test-timeout=60000 tests/covering-tests.test.mjs
