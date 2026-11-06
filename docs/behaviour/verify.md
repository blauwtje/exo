# verify: current behaviour

Built by `node skills/spec/scripts/behaviour.mjs` from the acceptance lines of the shipped briefs; edit a brief, not this file. A brief that holds a `Supersedes: <brief name>` line replaces that brief.

## fast-task-gate
- `killTree` with `platform: 'win32'` calls its `run` stub with `taskkill` and `['/pid', '<pid>', '/T', '/F']`; on POSIX a detached shell's grandchild is gone after `killTree`; a timed-out verify Proof and gate still fail with `timed out after <n>s` (Task 2; seam: `tests/process-tree.test.mjs`, `tests/verify-gate.test.mjs`).
- `next-task.mjs --in-flight 2` prints `Start:` with only tasks disjoint from Task 2, within `WAVE_LIMIT`, and `Start: none` when the window is full (Task 6; seam: `tests/next-task.test.mjs`, `tests/plan-tasks.test.mjs`).

## issues-115-117
- Task 2: in a temporary git repository with an `origin/main` ref, removing one `only` from `skills/x/SKILL.md` fails `boundary words` naming the file, `only` and both counts; a rewording that keeps every count passes; the same drop passes with `Drops: only in skills/x/SKILL.md` in a commit body or in `EXO_DROPS`; no `origin/main` gives `UNRUN`; the self-test's boundary scenario is rejected by exactly `boundary words`; seam: `tests/boundary-words.test.mjs`.
- Task 5: wave-worktrees.md step 4 passes `--report` for every folder, `--patch` for an unlanded folder with a diff, never `--force`; rolling-window.md step 6 keeps a stalled slot's folder; seam: `tests/implementing-waves.test.mjs`.
- The Success criterion passes on the branch rebased onto `origin/main`.

## review-reliability
- `node skills/verify/scripts/verify.mjs --plan <plan> --root .worktrees/<name> --base main` run from the repository root prints the same lines as with the absolute root (Task 1; seam: `verify.mjs` command in `tests/verify-gate.test.mjs`).
- `merge-reviews.mjs` given a report with a probe-less `fix` finding prints `fix=0` and a `DEMOTED 1` line (Task 2; seam: the command in `tests/merge-reviews.test.mjs`).
- `pick-reviewer.mjs --task <n>` prints `none (output only, test covered)` for a task changing only a `process.stdout.write(` line plus a test file, and the light reviewer once a logic line changes (Task 3; seam: the command in `tests/pick-reviewer.test.mjs`).
- `review-rules.md` sends a reviewer without report to `merge-reviews.mjs` as `BLOCKED` and holds no `unreviewed (turn cap)` (Task 5).
- The Success criterion passes.

## short-reports-text-review
- Task 1: `taskReviewer` returns the light pick for a task changing only `skills/x/SKILL.md`, and `none (text only)` for one changing only `README.md`; seam: `tests/pick-reviewer.test.mjs`.
- Task 5: no skill body or `CLAUDE.md` line asks for a user message longer than the rule's three lines plus one pointer.
- The Success criterion passes on the branch rebased onto `origin/main`.
