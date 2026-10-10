# Fast per-task gate (#110)

## Goal
A plan task in exo lands on static checks plus its own Proof, checked first by the builder that wrote it, with no per-task check red by design, a trivial gate failure fixed by that same builder, and every gate command stopped at a deadline.

## Decisions
All open decisions closed by exo on the user's standing instruction; each reads `Closed by: exo (recommended; user said pick the recommended option)` unless it names the code that settles it.

- Source: issue #110 body (merging #102, #113, #114) and its comment of 2026-10-09; this brief supersedes its Done when. The issue body is not edited (no GitHub write authorized).
- Already landed, per-task gate skip and once-per-tree full check (#102, #110 bullet 2): `skills/build/scripts/land-task.mjs` `runLandGate` skips a gate already passed on this tree or whose last pass took `SLOW_GATE_MS` (60 000 ms) or more (6808647e); `skills/verify/scripts/verify.mjs` skips a gate or Proof passed on this tree (c63cfc45); root `verify.mjs --self-test` reuses an `npm run check` pass whose code, `CHANGELOG.md` aside, is unchanged (`codePass` in `lib/check-cache.mjs`, 3a033397, 0e68b775). This content-addressed key stands in for #110's `git patch-id`. Closed by: code.
- #102's "Land gate defaults to a fast check (typecheck or lint, else none)", its `plan-check.mjs --loop` change and "tests cover the default": superseded by `docs/specs/check-once.md` (landed 55b7298c): `Land gate:` stays first of `check`, `test`, `typecheck`, run per task only while under 60 s, and `checkLoopLandGate` refuses only `Land gate: none`. The comment's failure does not break that rule; it breaks exo's own gate command, which Task 1 replaces. Closed by: exo (recommended; user said pick the recommended option), the later landed decision stands.
- Already landed, deadlines on reviewer and fixer: `agents/review-branch.md` `maxTurns: 30` with a 60 s command limit, `agents/fix-review.md` `maxTurns: 40`, `agents/solve-hard.md` `maxTurns: 60`, `agents/build-task.md` `maxTurns: 60`, `skills/build/scripts/wait-report.mjs` 540 s per run, a missing reviewer report merged as `BLOCKED` (`skills/verify/references/review-rules.md`). Not landed: the Land gate in `land-task.mjs` and every command `skills/verify/scripts/verify.mjs` runs have no deadline → Task 5. Closed by: code.
- Already landed, `spec` exploration returns file pointers only (`agents/locate-code.md` returns `<path>:<range>  <symbol>  <why>` lines, at most 30), and a change of at most two files gets no plan (`skills/route-skills/SKILL.md` step 2 routes it to no skill; `skills/build/SKILL.md` step 2 gates on over two files). No change. Closed by: code.
- Already landed, a task commit touching `CHANGELOG.md` is flagged (#113): `land-task.mjs` refuses a path outside the task's `Files:`, and `verify.mjs` `splitFixOnlyPaths` reports `CHANGELOG.md` as `STRAY` unless every commit touching it is a trailer-less `docs(changelog)` commit (e4c7b66f). `agents/build-task.md` already edits only `Files:` paths and reports others. Closed by: code.
- Exo's per-task gate: new flag `node verify.mjs --static` runs every check except `skill script behavior` (the test suite), `plugin version` and the verifier self-test, printing no line for them; script `"validate:static": "node verify.mjs --static"`; this repository's plans use `Land gate: npm run validate:static`. Measured on this tree: about 12 s against 60.3 s for `npm run validate`. The task's own test files run as its `Proof:`, so no affected-test selection is added. `plugin version` stays in `npm run check`, which verify and the landing on `main` run. Closed by: exo (recommended; user said pick the recommended option): removes the red-by-design gate the comment hit in detached task worktrees without weakening the detached-HEAD failure CI relies on.
- New script name, not a changed `npm run validate`: `.git/exo/check-cache.json` keys each pass by command string and holds `npm run validate` at 60 300 ms, so a faster script under the old name would be skipped per task by that stale record. `npm run validate` keeps running the suite; `CLAUDE.md` `## Commands` and `CONTRIBUTING.md` describe both scripts truthfully (#110 CLAUDE.md bullet). Closed by: exo (recommended; user said pick the recommended option).
- Rejected comment options: treating a detached task worktree like a feature branch in `plugin-version.mjs` (CI on a pull request runs detached and must still fail without the line), and `build` writing the lead's changelog line before the first dispatch (exo-repository rule inside a generic skill). Closed by: exo (recommended; user said pick the recommended option).
- `tests/check-reuse.test.mjs` "plugin version runs strict on a reused pass" commits a `## Unreleased` line as `origin/main` in its copy before stripping it, so it fails as intended whatever the checkout's `## Unreleased` holds, including right after a release. Closed by: exo (recommended; user said pick the recommended option).
- Builder runs the gate itself: `land-task.mjs --check`, which `agents/build-task.md` already runs before `GREEN`, also runs `Lint:` and the `Land gate:` with `runLandGate`'s skip rules; a pass is recorded on that tree, so the landing meets a cache hit and prints `skipped: it already passed on this tree`. The builder fixes a `Lint:` or `Land gate:` failure inside its `Files:` and reruns `--check`, at most twice, then returns `FAIL` with the last lines. Closed by: exo (recommended; user said pick the recommended option): reuses the step every builder runs, adds no new command for builders to learn.
- Landing refusal back to the same builder: in `agents/run-unit.md` step 4, every `land-task.mjs` refusal other than `PLAN DRIFT` goes by SendMessage, verbatim, to the `exo:build-task` agent that wrote the task, at most twice; `PLAN DRIFT`, a builder's `FAIL` or a third refusal goes to step 3's `exo:solve-hard` repair. No file-and-number parsing: a builder that sees no obvious fix returns `FAIL`. Closed by: exo (recommended; user said pick the recommended option).
- Deadlines: the `Land gate:` in `land-task.mjs` gets the Proof's `PROOF_TIMEOUT_MS` (540 s, under the 600 s Bash call that runs land-task); `verify.mjs` stops each Proof at 540 s and its gate at 1 800 s; an overrun fails with `timed out after <n>s` (fail closed, `skills/build/references/security.md` check 2). Closed by: exo (recommended; user said pick the recommended option): the final gate runs once and may be slow on other projects, 30 min bounds a hang without failing a healthy slow suite.
- Compact brief: a task with at most two `Files:` entries gets a brief from `next-task.mjs` `taskBrief` with only the Non-goals, Context and Decisions bullets that name one of its paths or regions (no fallback to every bullet), a heading with none left out, and `Modify ranges:` left out when empty; tasks with three or more `Files:` keep today's brief. Goal, files, check command and report shape stay: `Goal:` line, the task section's `Files:` and `Proof:`, and `agents/build-task.md` `## Report`. Closed by: exo (recommended; user said pick the recommended option): the 6 KB briefs of the measured run came from the every-bullet fallback.
- `run-unit` edits and commits no file itself (#113); `build-task`'s "report others" already returns a line it may not write. No `Changelog:` report field: the lead writes `CHANGELOG.md` from the landed task headings. Closed by: exo (recommended; user said pick the recommended option).
- `agents/review-branch.md` runs only single test files and `Probe:` commands, never `verify.mjs`, `npm run check`, `npm run validate` or `npm test`; a finding that needs the full suite → `question` (#114). Closed by: exo (recommended; user said pick the recommended option).
- Rolling window in `run-unit` (#110 bullet 7): out of scope here, for a follow-up issue the lead files. Builds in one checkout would land while siblings still write, so a rolling window needs per-task landing out of `skills/build/references/wave-worktrees.md`, a restructure of `agents/run-unit.md` at 742 of its 750 tokens; the measured run lost its time in gates and `exo:solve-hard`, not batch waits (builders 13-47 s). Closed by: exo (recommended; user said pick the recommended option).
- This plan keeps `Land gate: npm run validate`: `validate:static` exists only once Task 1 lands, and wave worktrees fork before that. Closed by: exo (recommended; user said pick the recommended option).
- Every agent-file task stays within the 750-token agent body ceiling (`verify/budgets.mjs` `AGENT_BODY_TOKENS`): `agents/run-unit.md` has about 8 tokens free, `agents/build-task.md` about 16, `agents/review-branch.md` about 0, so each such task compresses existing lines per `skills/edit-skills/references/instruction-style.md` `## Compress`, drops no rule, and keeps every phrase `tests/agents.test.mjs` and `tests/run-unit-contract.test.mjs` match.
- Tasks 6, 7, 8, 9 and 10 edit instruction text → each follows `skills/edit-skills/references/instruction-style.md`.
- No task edits `CHANGELOG.md`; the lead writes one line per change at landing.

## Acceptance
- `node verify.mjs --static` prints no `skill script behavior`, `plugin version` or `verifier self-test` line and ends `SUMMARY` with `FAIL=0`, so an empty `## Unreleased` cannot fail it (Task 1; seam: `tests/verify-static.test.mjs`).
- The strict reuse test fails `plugin version` with the checkout's `## Unreleased` empty or not (Task 2; seam: `tests/check-reuse.test.mjs`).
- `land-task.mjs --check` with a failing `Land gate:` exits 1 with the gate's output; with a passing one it prints the gate line and `Report OK`, and the following landing prints `skipped: it already passed on this tree` (Task 3; seam: `tests/land-task.test.mjs`).
- A Land gate or verify command past its deadline fails with `timed out after` (Task 5; seam: `tests/land-task.test.mjs`, `tests/verify-gate.test.mjs` regression).
- `agents/build-task.md` fixes a `--check` gate failure at most twice; `agents/run-unit.md` returns a refusal to its builder at most twice and edits no file (Tasks 6, 7, 8; seam: `tests/run-unit-contract.test.mjs`).
- `agents/review-branch.md` names the four full-suite commands as off limits (Task 9; seam: `tests/agents.test.mjs`).
- A one-file task's brief holds no Decisions bullet that names none of its paths (Task 4; seam: `tests/next-task.test.mjs`).
- `CLAUDE.md` gates plan tasks on `npm run validate:static` (Task 10).
- The Success criterion passes.

## Manual checks
- On the next real plan run, compare wall time per task and per-task gate time with the 2026-10-09 one-chat-run case (30 min in, 1 of 9 tasks landed; land gates 21:25-21:32).

## Plan basis
Repository: /Users/thomash/Documents/Code/personal/plugins/exo/.worktrees/fast-task-gate
Branch: fast-task-gate
Worktree setup: none
Land gate: npm run validate
Lint: none
Allow: none

## Success criterion
`npm run check`

## Checkpoint
- Blocks first: Tasks 1, 3 and 7.
- Parallel: Tasks 1, 2, 3, 4, 7 and 9; Tasks 5 and 6 after Task 3, Task 8 after Task 7, Task 10 after Task 1.
- Shared state: `skills/build/scripts/land-task.mjs` (Tasks 3, 5), `agents/run-unit.md` and its token ceiling (Tasks 7, 8), the script name `validate:static` (Tasks 1, 10), each serialized by Depends on.
- Smallest safe split: one task per concern; a file two concerns share is serialized by Depends on.

## Tasks
### Task 1: feat(verify): run only the static checks under node verify.mjs --static
Depends on: none | Files: `verify.mjs`, `package.json`, `tests/verify-static.test.mjs` | Data: a `--static` boolean in `verify.mjs`'s `parseArgs` that skips `checkSkillScriptBehavior`, `checkPluginVersion` and `runSelfTest`, plus the script `"validate:static": "node verify.mjs --static"` | Proof: node --test tests/verify-static.test.mjs
### Task 2: test(check-reuse): keep the strict reuse test failing on an empty Unreleased
Depends on: none | Files: `tests/check-reuse.test.mjs` | Data: the strict test's copy commits a `## Unreleased` line and moves `refs/remotes/origin/main` to that commit before stripping the section, so the tree differs from `origin/main` by `CHANGELOG.md` alone | Proof: node --test tests/check-reuse.test.mjs
### Task 3: feat(build): run Lint and the Land gate under land-task --check
Depends on: none | Files: `skills/build/scripts/land-task.mjs`, `tests/land-task.test.mjs` | Data: `checkTask` calls `runLint` and `runLandGate` after `checkReport` and returns the gate line before `Report OK: Task <n>`, a gate failure refusing as the landing does (fail closed per `skills/build/references/security.md` check 2) | Risk: security boundary | Proof: node --test tests/land-task.test.mjs
### Task 4: feat(build): leave out of a small task's brief the bullets that name none of its paths
Depends on: none | Files: `skills/build/scripts/next-task.mjs`, `tests/next-task.test.mjs` | Data: `taskBrief` for a task with at most two `Files:` entries keeps only the Non-goals, Context and Decisions bullets that name its paths or regions, leaving out an empty heading and an empty `Modify ranges:`; three or more entries keep today's brief | Proof: node --test tests/next-task.test.mjs
### Task 5: fix(build): stop a Land gate or verify command past its deadline
Depends on: 3 | Files: `skills/build/scripts/land-task.mjs`, `skills/verify/scripts/verify.mjs` | Data: `runLandGate`'s `spawnSync` gets `timeout: PROOF_TIMEOUT_MS`, and `verify.mjs` `runCommand` takes a deadline, 540 000 ms per Proof and 1 800 000 ms for the gate, each overrun failing with `timed out after <n>s` (fail closed per `skills/build/references/security.md` check 2) | Risk: security boundary | Proof: node --test tests/land-task.test.mjs tests/verify-gate.test.mjs
### Task 6: feat(build-task): fix a --check Lint or Land gate failure at most twice before FAIL
Depends on: 3 | Files: `agents/build-task.md` | Data: the `## Build` line on `Proof:` drops its clause excluding the `Land gate:`, and the `## Return` line on `--check` gains that `--check` also runs `Lint:` and `Land gate:` with Bash `timeout: 600000`, and that their failure is fixed inside `Files:` and rerun at most twice, then `FAIL` with its last lines, within the 750-token agent ceiling | Proof: grep -n "at most twice" agents/build-task.md
### Task 7: feat(run-unit): send a landing refusal back to its builder at most twice
Depends on: none | Files: `agents/run-unit.md`, `tests/run-unit-contract.test.mjs` | Data: step 4's two refusal bullets become: a refusal other than `PLAN DRIFT` goes by SendMessage to its writer, verbatim, at most twice, never rerunning a proof; `PLAN DRIFT`, a writer's `FAIL` or a third refusal goes to step 3; within the 750-token agent ceiling | Proof: node --test tests/run-unit-contract.test.mjs
### Task 8: fix(run-unit): edit and commit no file in the unit itself
Depends on: 7 | Files: `agents/run-unit.md` | Data: one `## Stop` bullet `Edit, write or commit no file yourself: builds edit, land-task.mjs commits`, within the 750-token agent ceiling | Proof: grep -n "commit no file yourself" agents/run-unit.md
### Task 9: fix(review-branch): keep the branch reviewer off the full suite
Depends on: none | Files: `agents/review-branch.md`, `tests/agents.test.mjs` | Data: the `## Review` line on confirming findings allows only a single test file or `Probe:` command, never `verify.mjs`, `npm run check`, `npm run validate` or `npm test`, and sends a finding that needs the full suite to `question`; within the 750-token agent ceiling | Proof: node --test tests/agents.test.mjs
### Task 10: docs(repo): gate this repository's plan tasks on npm run validate:static
Depends on: 1 | Files: `CLAUDE.md`, `CONTRIBUTING.md` | Data: `CLAUDE.md` `## Commands` line on plan tasks names `Land gate: npm run validate:static` (static checks, no test suite), and the `CONTRIBUTING.md` `## Checks` table rows say `npm run validate` runs the structural checks and the script tests and `npm run validate:static` the structural checks only | Proof: grep -n "validate:static" CLAUDE.md CONTRIBUTING.md
