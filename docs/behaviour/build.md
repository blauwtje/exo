# build: current behaviour

Built by `node skills/spec/scripts/behaviour.mjs` from the acceptance lines of the shipped briefs; edit a brief, not this file. A brief that holds a `Supersedes: <brief name>` line replaces that brief.

## brief
- Each launcher SKILL.md holds `context: fork` (Task 11).

## plan
- A run-plan child for a mechanical kind starts with the output cap, or the results file says the harness has no support (Task 4).
- `exo claude --provider deepseek` at a peak time prints the off-peak notice (Task 5).
- A sweep record on deepseek carries cache hit and miss tokens and a `costUsd` within 20% of the balance delta (Task 6).
- The final verdict block and its tests: Task 3. The fork's use of it with one suite run on a miss: Task 4.
- Ledger entries are added by the lead before the build; the arm, results page, verdicts and changelog come after it, then the Success criterion.

## fast-task-gate
- A two-file task's brief keeps a Decisions bullet naming its file by basename or by its directory, and leaves out one naming only a sibling file or a same-named file elsewhere (Task 1; seam: `tests/next-task.test.mjs`).
- A Land gate and a Proof past their deadlines are refused with `timed out after <n>s`, nothing commits, and their grandchild writes no marker file afterwards (Task 4; seam: `tests/land-task.test.mjs`).
- `wait-report.mjs --any` exits 0 on the first fresh report and prints only it; a per-report `--since` makes an older report not count (Task 5; seam: `tests/wait-report.test.mjs`).
- `skills/build/references/rolling-window.md` exists with its row and `npm run validate:static` passes (Task 8).
- The Success criterion passes.

## issues-115-117
- Task 3: `land-task` runs the land gate with `EXO_DROPS` set to the task's `Drops:` value, in both `--check` and landing, and a compact task's commit body carries the `Drops:` line; a task without the field sets nothing; seam: `tests/land-task.test.mjs`.
- Task 4: `remove-worktree.mjs --report <absent file>` exits 1, and the worktree stays in `git worktree list` (a blocked wave with one build still running); with the report present it removes; `--patch` with an absent or empty file refuses on a dirty tree; with a non-empty patch it removes; `--force` exits 2; seam: `tests/remove-worktree.test.mjs`.
- Task 5: wave-worktrees.md step 4 passes `--report` for every folder, `--patch` for an unlanded folder with a diff, never `--force`; rolling-window.md step 6 keeps a stalled slot's folder; seam: `tests/implementing-waves.test.mjs`.

## lean-open-2
- Task 1: a land whose behaviour file is stale refreshes it, stages it and lands; a land with a current file runs no refresh.
- Task 5: a land that leaves a path of another open task unstaged prints a warning naming the path and that task, and lands.
- Task 6: the two tests match the exact refusal text.
- Task 8: a task slot, a setup worktree and a conflict tree hold the main checkout's gitignored `.env` files, and land never stages one.
- Task 9: `CONTRIBUTING.md` describes the end states and the `.env` copy as Tasks 4 and 8 left them.
- Success criterion: `npm run check` ends `SUMMARY` with `FAIL=0 WARN=0 UNRUN=0`.

## lean-open-3
- Task 1: a run checkout under `.claude/worktrees` that is the plan's `Repository:` forms a parallel wave; a checkout under `.claude/worktrees` that is not the `Repository:` still builds one task at a time.
- Task 2: after a land that amends the plan, the run checkout shows no pending plan edit and the next slot land does not refuse `NEWPATH`.
- Task 3: a slot land that leaves a sibling-owned file unstaged runs the land gate on the committed tree and does not report a cached pass.
- Success criterion: `npm run check` ends `SUMMARY` with `FAIL=0 WARN=0 UNRUN=0`.

## lean-open
- Task 1: the dead file, `repairOrBlock`, the `code rule` kind and the `no red proof` prompt line are gone and the tests pass.
- Task 2: the several-violations land is covered and passes.
- Task 3: the warning for a protected path names it, says it was not committed and gives the next step.
- Task 4: `lib/guard-rules.mjs`, `lib/git-deny.mjs`, `skills/build/scripts/land-*.mjs` and `docs/plans/` outside Files are not in the commit and get the same warning.
- Task 5: a newly added prose file lands.
- Success criterion: `npm run check` ends `SUMMARY` with `FAIL=0 WARN=0 UNRUN=0`.

## loop-budget-2
- A two-task plan builds with the main session dispatching exo:build-task directly, with no task-runner and no `wait-report.mjs` call (Task 1, Task 2, Task 5).

## loop-budget
- look.mjs ends within its kinds-table wall timeout (Task 8).

## review-reliability
- `review-fixer-prompt.md` holds the `git log -S` removed-text check and the static Land gate revert rule (Task 6).

## run-efficiency
- Task 1: `claudeArgs` output holds `--exclude-dynamic-system-prompt-sections`; seam: `tests/run-session-args.test.mjs`. Gain unmeasured: the proposal's probe saw 4.7k of 11.6k first-turn tokens read from cache in one unpaired call, and anthropics/claude-code#74318 measured -7.6% in a different setup.
- Task 2: `claudeArgs` holds `--max-turns 60` per task for kind `build` (60 × n for a plan session of n tasks), 40 for `fix` and 30 for `review`, each read from the agent's frontmatter; seam: `tests/run-session-args.test.mjs`. No saving is claimed; adoption test: grep kept `iter-*-task-*.log` result events for `num_turns` above 60.
- Tasks 6-8: each session's ledger line and the run report show its cache read share, and a warning appears when its turn-1 cache write passes the bar; seams: `tests/run-report.test.mjs`, `tests/run-plan-hook-refusals.test.mjs`. Adoption test: compute the share for the kept `cache-ab` runs and check that it flags the 5m post-wait rewrite in `cache-ttl-ab.md` test 3.
- Tasks 11-12: a headless session that ends on its `--max-turns` cap leaves its task blocked, its partial diff in `.exo/carry/task<n>-partial.patch`, the run tree reset, and no repair or retry session; seam: `tests/run-plan-max-turns.test.mjs`. No saving is claimed.
- The Success criterion passes on the branch rebased onto `origin/main`.

## small-items
- Task 1: a build report with `Proof: <command>: pass` on one line lands.
- Task 4: a task brief from next-task carries the plan's Decisions.
