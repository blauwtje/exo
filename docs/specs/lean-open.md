## Goal
The lean-native cleanup is finished: dead repair code is gone, a protected path stays out of a task commit with a clear warning, and the proven branch-review defects are fixed.

## Verdict
Verdict: go
Objection: points 5 and 6 can stay open, because proof that a T rule is needed and the routing run both cost paid model sessions.

## Manual checks
- None.

## Plan basis
Repository: /Users/thomash/Documents/Code/personal/plugins/exo/.claude/worktrees/lean-open-spec
Branch: spec/lean-open
Worktree setup: none
Land gate: npm run validate:static
Land: local
Commit: fix(lean): finish the lean-native cleanup
Lint: none
Allow: none

## Success criterion
`npm run check`
Red: none (each task Proof proves its own red)

## Checkpoint
- Blocks first: none.
- Parallel: Tasks 1, 2, 3 and 6.
- Shared state: Tasks 3, 4 and 5 write the land scripts (land-paths.mjs, land-refusals.mjs) and tests/land-amend.test.mjs or tests/land-task-commit.test.mjs, so they run in order 3, 4, 5.
- Smallest safe split: one task per concern, each with its own test.

## Tasks
### Task 1: fix(build): remove the dead repair path and the unused code rule kind
Depends on: none | Files: `skills/build/scripts/run-plan-land-repair.mjs`, `skills/build/scripts/run-plan.mjs`, `skills/build/scripts/run-plan-repair.mjs`, `lib/run-outcomes.mjs`, `skills/build/drift-repairer-prompt.md`, `tests/refusal-handlers.test.mjs`, `tests/run-plan-stop-path.test.mjs`, `tests/run-outcomes.test.mjs`, `tests/run-plan-budget.test.mjs`, `CONTRIBUTING.md`, `verify/module-size-ceilings.txt` | Data: no new structure; the file, one function, one outcome row and one prompt line are deleted | Evidence: none (removes one unreachable prompt line, no wording is added) | Proof: node --test --test-timeout=60000 tests/refusal-handlers.test.mjs tests/run-plan-stop-path.test.mjs | Drops: only in skills/build/drift-repairer-prompt.md, no in skills/build/drift-repairer-prompt.md
### Task 2: test(land): restore the several-violations land
Depends on: none | Files: `tests/land-task-retry.test.mjs` | Data: one test in the existing file, with a ledger assertion of one entry | Red: none (production already refuses a missing Data literal and a missing report together, so the test passes today and no red was possible) | Proof: node --test --test-timeout=60000 tests/land-task-retry.test.mjs
### Task 3: fix(land): say a protected path was left out of the commit
Depends on: none | Files: `skills/build/scripts/land-paths.mjs`, `skills/build/scripts/land-candidate.mjs`, `skills/build/scripts/land-refusals.mjs`, `tests/land-amend.test.mjs` | Data: one shared protected-path predicate in land-paths.mjs, built from the existing SECURITY_BOUNDARY pattern | Risk: security boundary | Boundary: in a path outside Files that is not protected | out a protected path named without a not-committed warning | test tests/land-amend.test.mjs | Proof: node --test --test-timeout=60000 tests/land-amend.test.mjs
### Task 4: fix(land): keep land-amend protected paths out of the task commit
Depends on: 3 | Files: `skills/build/scripts/land-paths.mjs`, `skills/build/scripts/land-candidate.mjs`, `skills/build/scripts/land-amend.mjs`, `tests/land-task-commit.test.mjs` | Data: the PROTECTED_PATHS list moves into the shared predicate in land-paths.mjs, and land-amend imports it | Risk: security boundary | Boundary: in a path inside Files or an unprotected path outside it | out a protected path outside Files staged into the commit | test tests/land-task-commit.test.mjs | Proof: node --test --test-timeout=60000 tests/land-task-commit.test.mjs tests/land-amend.test.mjs
### Task 5: fix(land): skip the dropped-words check for a file with no HEAD blob
Depends on: 4 | Files: `skills/build/scripts/land-refusals.mjs`, `tests/land-task-commit.test.mjs` | Data: none; droppedWords returns an empty list when the file has no HEAD blob | Risk: security boundary | Boundary: in a tracked prose file with a HEAD blob | out a throw on a newly added prose file | test tests/land-task-commit.test.mjs | Proof: node --test --test-timeout=60000 tests/land-task-commit.test.mjs
### Task 6: fix(plan-check): say land warns, not refuses, on a Proof with no red
Depends on: none | Files: `skills/spec/scripts/plan-check-frame.mjs`, `tests/fixtures/plans/bad/refactor-without-red.md`, `tests/fixtures/plans/bad/proof-equals-land-gate.md`, `tests/fixtures/plans/bad/test-only-files-without-red.md`, `tests/plan-check-corpus.test.mjs`, `verify/module-size-ceilings.txt` | Data: three message strings in plan-check-frame.mjs and the expect line of three fixtures | Proof: node --test --test-timeout=60000 tests/plan-check-corpus.test.mjs

## Assumptions
- Task 1: landInOrder returns undefined always, so landOrRepair never repairs; run-plan.mjs calls landInOrder from run-plan-landing.mjs directly. Its red is a new assertion in tests/refusal-handlers.test.mjs that the file, `repairOrBlock`, the `code rule` kind and the `no red proof` prompt line are absent.
- Task 1 keeps `repairTask` and `repairedNote`, which run-plan.mjs still uses, and removes the `blockedStop` import only if nothing else in run-plan-repair.mjs uses it.
- Task 2 needs no red: a scratch run of the land with a missing Data literal and no report exits 1 and names both, so only the coverage is missing.
- Task 3 red: a test that a `hooks/guard.mjs` path outside Files gives a warning naming the path, saying it was not committed and giving the next step (add it to Files or give it its own task); today the text only says `changed a path outside Files`.
- Task 4 red: `lib/guard-rules.mjs` outside Files is committed today, so the flipped assertion fails first. `checkOutsideTaskFiles` keeps throwing for a guarded path that reaches a commit.
- Task 5 red: a staged new `skills/x/new.md` makes `git show HEAD:<file>` exit 128 while `git ls-files` lists it (probed in a scratch repo). If the builder finds the land green, it reports and drops the task.
- Task 6 red: the corpus test fails once the fixtures hold the new text and the frame still says `land will refuse`.

## Acceptance
- Task 1: the dead file, `repairOrBlock`, the `code rule` kind and the `no red proof` prompt line are gone and the tests pass.
- Task 2: the several-violations land is covered and passes.
- Task 3: the warning for a protected path names it, says it was not committed and gives the next step.
- Task 4: `lib/guard-rules.mjs`, `lib/git-deny.mjs`, `skills/build/scripts/land-*.mjs` and `docs/plans/` outside Files are not in the commit and get the same warning.
- Task 5: a newly added prose file lands.
- Task 6: plan-check says land warns.
- Success criterion: `npm run check` ends `SUMMARY` with `FAIL=0 WARN=0 UNRUN=0`.
- Success criterion, second done line: `node benchmarks/lean-guards-compare.mjs` exits 0 with bytes <= 2666 and modules <= 77; no task adds a module.

## Non-goals
- A new hook, an extra module in a hook, or growth of the session start text.
- Removing a T rule from hooks/session-rules.md, and any edit to hooks/session-routing.md.
- The `needsInput` end state in lib/loop-budget.mjs: a documented contract.
- CHANGELOG.md: the lead writes it.

## Decisions
- Task 4 changes behaviour: a protected path outside Files is committed with the task today (tests/land-task-commit.test.mjs:83 asserts it) and now stays out. The lead decided this, so flipping the assertion at tests/land-task-commit.test.mjs:77-85 is a decided change, not a weakened test.
- Task 3 and 4 share one protected-path predicate in land-paths.mjs, which avoids an import cycle through land-amend.
- Tasks 3, 4 and 5 are serial because they share land-refusals.mjs and land test files.
- No paid routing run: the dry run costs $69.21 and the minimum detectable effect is 0.051 against a needed effect of 0.03.
- Point 5: reading B holds for T2 and T3 (partly native is not native), and T1 and T4 have no doc line (https://code.claude.com/docs/en/sub-agents), so no T rule is removed; a need-test takes paid model sessions and is reported as open in the final report.
- Point 6: no paid routing run (dry run $69.21, minimum detectable effect 0.051 against a needed effect of 0.03); hooks/session-routing.md takes no edit. The user left the decision to the lead; reported as open in the final report.

## Reported, not fixed
- `needsInput` end state (lib/loop-budget.mjs, lib/run-outcomes.mjs): no production caller passes it, but CHANGELOG.md, CONTRIBUTING.md and tests document it.
- plan-check-loop.mjs:29-36 leaves orphaned children after the 120 s timeout; a fix needs a process group kill and no cheap probe exists.
- `EXO_CRITERION_TIMEOUT_MS` is read from `process.env`, not through `environmentMs`: convention only.
- `{ env: false }` callers (open-slots.mjs, setup.mjs, conflict-wave.mjs, red-green.mjs) against "every new worktree gets .env": no wrong behaviour shown, a question for the lead.
- A file of another open task is neither staged nor warned (unplannedPaths drops sibling work): a warning would name another task's work in progress.
- hooks/handoff-stub.md:1 goal text, stray space in two tests/checkout.test.mjs names, the machine-dependent red at tests/checkout.test.mjs:96-101, the loose `/^REFUSED 1\b/` match in tests/land-slot.test.mjs:73-80, and the bundled CHANGELOG.md:31 bullet: style or test notes.
