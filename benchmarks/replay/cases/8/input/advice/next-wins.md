# Next wins for exo runs (2026-10-17, main 12085983)

Checked: 15 run invocations (14 plans) in `.exo/kept/`, newest first: 6862, e69d, c0b1, 5316, 57c6, 74af, d34e+4e67 (one plan), 7d2b, 2917, 50bd, 28d7, e21a, 356f, f306.
Skipped: bench output, `revert-fix-tier`, `replay-plan` (check logs only), `xcrun-cache`, `run-audit`, dbbd and 0df8 (no `run.log`).
Settled and not repeated here: everything in `review.md` (#1-#5, light reviewer skipped, fix-diff tier reverted), `steps-4-7-progress.md`, `recount-p1.md`; overlap tier and seeded controls are out of scope.

Scripts (`.exo/advice/scripts/`):
- `runs.mjs <kept> <runId>...`: wall seconds per phase from `run.log`, cost per kind/model from `sessions.jsonl`.
- `tail.mjs <kept> <name>...`: `duration_ms` per session log (task, plan, review, fix, repair).
- `shared.mjs <plan>...`: paths listed by more than one task.

## Where the 14 plans spend now

- Cost $22.83 (ledger; d34e and 4e67 share one ledger, counted once). Review sessions $11.88 = 52%; opus branch review alone $0.19-0.61 per run.
- Wall 10,301 s inside runs: tasks 5,384 (52%), fix stage 1,892 (18%), review 1,541 (15%), Success step 1,037 (10%), fix-diff review 447 (4%).
- The 8 newest runs are small: 1-7 min, $0.28-1.35. Fixed per-run steps weigh more there than in the older 10-36 min runs.

## #1 Plan sessions for small plans whose tasks share a file

**Claim:** `auto` falls back to one session per task only because two tasks list the same path. Plan mode is about twice as cheap and fast per task.

| Evidence | Numbers |
|---|---|
| Rule | `run-prompts.mjs:76-81` `sessionMode`: plan mode needs <= 4 tasks (`INLINE_TASK_LIMIT`), no shared path, no design task |
| Runs pushed to task mode by a shared path | `shared.mjs`: e69d 3 tasks (`sweep.mjs` x2, `sweep-score.mjs` x2); 7d2b 4 tasks (`CONTRIBUTING.md` x3, `run-plan.mjs` x2); 4e67 4 tasks (`pressure.mjs` x3, test x2). 3 of 8 recent runs |
| Plan-mode runs | c0b1 2 tasks 29 s $0.09; 5316 2 tasks 42 s $0.14; 57c6 2 tasks ~65 s $0.19; 74af 3 tasks 87 s $0.27 (`run.log`). Avg ~$0.07 and ~25 s per task |
| Task-mode runs | e69d 195 s $0.56; 7d2b 178 s $0.35; 4e67 220 s $0.39 for the task stage (`runs.mjs`). Avg ~$0.12 and ~54 s per task, plus ~9k first cache write per session |

**Gain:** ~2 min wall and ~$0.18 per eligible run; on the 3 runs above ~350 s and ~$0.53 together, 30-60% of their task stage.
- Estimate: plan-mode rate x their task count, against their real task stage.

**Cost to build:** medium, ~60-100 lines. The plan session must land task n before it edits task n+1, so land-task can split a shared file per task. Drop the shared-path refusal in `sessionMode` when the session lands in order.

**Risk:** a task commit carries another task's hunk of a shared file; breach check or `UNPLANNED` flags it. Selection bias: plan-mode runs were small plans, so the per-task rate may be optimistic. Widening past 4 tasks stays rejected (CONTRIBUTING `## Rejected`).

**Confidence:** medium. 3 runs eligible, 4 runs give the plan-mode rate.

## #2 Doc-only closing task without a session

**Claim:** most task-mode plans end with a doc-only task (the CHANGELOG line). It still pays a full session start, a land and a gate.

| Run | Task | Wall | Cost |
|---|---|---|---|
| 6862 | t5 `docs(changelog)` | 27 s | $0.01 haiku |
| e69d | t3 | 27 s | $0.01 haiku |
| 4e67 | t4 | 23 s | $0.01 haiku |
| 7d2b | t4 | 37 s | $0.01 haiku |
| 2917 | t7 | 9 turns, wall 537 s (sleep gap, see skipped) | $0.01 haiku |

Haiku = `doc-task` kind, so each task lists only `.md` files (CONTRIBUTING `## How a skill dispatches work`).

**Gain:** ~25-35 s per task-mode run, 5-10% of wall in a 6-7 min run. Cost gain ~$0.01, negligible.

**Cost to build:** small, ~40 lines. When the task's only change is a literal line in `## Unreleased` given in its `Data:`, land-task writes and commits that line itself; else a session runs as now.

**Risk:** low. Wording drift in the line is a review finding today too. Overlaps #1: in plan mode the doc task is folded in already, so build #2 only if #1 is not built or plans exceed 4 tasks.

**Confidence:** high on the numbers (5 runs), the gain is small.

## #3 The 16 s step between "final review start" and the first review

**Claim:** every run spends 16-18 s between `all tasks landed, final review start` and `review start`, also when the Success criterion is clean and nothing changed.

| Evidence | Numbers |
|---|---|
| Fixed gap | 16-18 s in 12 of 14 runs (`runs.mjs` `success=`); f306 1 s; e21a 406 s and 356f 432 s ran a full or red Success criterion |
| Share | 16 s of 71 s (c0b1), 116 s (57c6), 186 s (5316) wall: 9-23% of the newest small runs |
| Code | `run-plan.mjs:835` says the line, then `runTail`; `run-tail.mjs:109` runs the Success criterion and times it (`ms`) |

**Gain:** up to ~16 s per run if the step can reuse the last land gate or the check cache on the same tree. f306 shows 1 s is possible.

**Cost to build:** unknown until the 16 s is split: read the `ms` the tail records, or time one run. Look first (~15 min), build only if most of it is avoidable.

**Risk:** skipping a real Success run lets a red tree reach review; 356f shows the Success step does catch `FAIL=1` that the per-task `validate:static` gate missed.

**Confidence:** high that the gap exists (12 runs), low that it is avoidable.

