# verify: current behaviour

Built by `node skills/spec/scripts/behaviour.mjs` from the acceptance lines of the shipped briefs; edit a brief, not this file. A brief that holds a `Supersedes: <brief name>` line replaces that brief.

## bench-honesty
- A sweep run with `--baseline` writes the section with the excluded runs and a verdict per metric (Task 2).
- The gate prints `FAIL benchmark` for a fixture regression, `PASS benchmark (baseline: none)` with no baseline, and `WARN benchmark override (<reason>)` with an override (Task 3).
- The squash commit body carries the override trailer (Task 4).
- `npm run check` fails a results file whose comparison counts a bypassing run and passes the rewritten Karpathy file (Tasks 5 and 6, Success criterion).

## brief
- Each launcher SKILL.md holds `context: fork` (Task 11).
- `node --test tests/harness-capabilities.test.mjs` passes and fails when a matrix row and an adapter disagree (Task 1).

## plan
- SessionStart output opens with the static rule text (Task 3).
- A run-plan child for a mechanical kind starts with the output cap, or the results file says the harness has no support (Task 4).
- Task 1: meta.json holds the base commit and `baseDirty` only when a base checkout is given, and is unchanged without it.
- Task 4: `--results x.md` is refused, `--dry-run --base` lists both arms per pair with a projection over both, and the existing sweep tests pass unchanged.
- Over-limit commands are rewritten, not denied: Task 1. Per-call ms: Task 2.
- Task 2: a subagent's `git stash` runs as a saved patch and never reaches the shared stash list; `git stash pop` is still denied.
- Task 3: a Write whose only break is added comment lines lands with those lines stripped; a nested ternary is still refused.

## fast-task-gate
- `killTree` with `platform: 'win32'` calls its `run` stub with `taskkill` and `['/pid', '<pid>', '/T', '/F']`; on POSIX a detached shell's grandchild is gone after `killTree`; a timed-out verify Proof and gate still fail with `timed out after <n>s` (Task 2; seam: `tests/process-tree.test.mjs`, `tests/verify-gate.test.mjs`).
- `next-task.mjs --in-flight 2` prints `Start:` with only tasks disjoint from Task 2, within `WAVE_LIMIT`, and `Start: none` when the window is full (Task 6; seam: `tests/next-task.test.mjs`, `tests/plan-tasks.test.mjs`).

## issues-115-117
- Task 2: in a temporary git repository with an `origin/main` ref, removing one `only` from `skills/x/SKILL.md` fails `boundary words` naming the file, `only` and both counts; a rewording that keeps every count passes; the same drop passes with `Drops: only in skills/x/SKILL.md` in a commit body or in `EXO_DROPS`; no `origin/main` gives `UNRUN`; the self-test's boundary scenario is rejected by exactly `boundary words`; seam: `tests/boundary-words.test.mjs`.
- Task 5: wave-worktrees.md step 4 passes `--report` for every folder, `--patch` for an unlanded folder with a diff, never `--force`; rolling-window.md step 6 keeps a stalled slot's folder; seam: `tests/implementing-waves.test.mjs`.
- The Success criterion passes on the branch rebased onto `origin/main`.

## loop-budget
- A gate re-entry on the same run continues the ledger round count instead of restarting it (Task 5).
- One Agent dispatch that breaks three brief rules is refused once, naming all three; the third refusal of the same dispatch stops with `LOOP refusal STOP cap` (Task 2).
- look.mjs ends within its kinds-table wall timeout (Task 8).
- `npm run check` fails a planted cap literal and a first-only rule module (Task 4, Task 11, Success criterion).

## review-reliability
- `node skills/verify/scripts/verify.mjs --plan <plan> --root .worktrees/<name> --base main` run from the repository root prints the same lines as with the absolute root (Task 1; seam: `verify.mjs` command in `tests/verify-gate.test.mjs`).
- `merge-reviews.mjs` given a report with a probe-less `fix` finding prints `fix=0` and a `DEMOTED 1` line (Task 2; seam: the command in `tests/merge-reviews.test.mjs`).
- `pick-reviewer.mjs --task <n>` prints `none (output only, test covered)` for a task changing only a `process.stdout.write(` line plus a test file, and the light reviewer once a logic line changes (Task 3; seam: the command in `tests/pick-reviewer.test.mjs`).
- `review-rules.md` sends a reviewer without report to `merge-reviews.mjs` as `BLOCKED` and holds no `unreviewed (turn cap)` (Task 5).
- The Success criterion passes.

## short-reports-text-review
- Task 1: `taskReviewer` returns the light pick for a task changing only `skills/x/SKILL.md`, and `none (text only)` for one changing only `README.md`; seam: `tests/pick-reviewer.test.mjs`.
- Task 3 and Task 4: question.md allows at most three options, and every configure menu prints at most three lettered options.
- Task 5: no skill body or `CLAUDE.md` line asks for a user message longer than the rule's three lines plus one pointer.
- The Success criterion passes on the branch rebased onto `origin/main`.

## small-items
- The Success criterion passes on the branch rebased onto `origin/main`.
