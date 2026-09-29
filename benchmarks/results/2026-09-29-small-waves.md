# Small-plan waves: flow-c7, branch against main

Cell `flow-c7` (kind `flow`, `claude-sonnet-5` at effort `high`, budget $25, timeout 120 min): build runs the fixed four-task plan `docs/plans/text-helpers.md` onto `feat/text-helpers`. Each arm ran once, on 2026-09-29, through `node benchmarks/sweep.mjs --set flow --confirm`. The branch is `eight-behaviors` at `b9f7561` and main is `origin/main` at `a70f0fd`. The fixture plan has no `Checkpoint` or `Parallel:` line, only a Context bullet calling the four tasks independent. The branch's `nextWave` treats a missing line as no restriction, so `next-task.mjs` prints `Wave: Task 1, Task 2, Task 3, Task 4`. Lead peak comes from the branch's `benchmarks/cell-usage.mjs`, run over each arm's transcript. The two arms ran at the same time, next to other benchmark sessions, so wall-clock time carries load noise.

| Arm | Lead peak context | Total tokens | Wall-clock | Build phase | Conflict repairs | Wave of 2+ tasks | Tasks landed | Subagents | Cost |
|---|---|---|---|---|---|---|---|---|---|
| main (`a70f0fd`) | 62,884 | 432,252 | 302 s | 302 s (one task at a time, `--one`) | 0 | no | 4/4 | 4 build-task | $1.04 |
| branch (`b9f7561`) | 78,386 | 763,725 | 624 s | 153 s (one wave of 4 worktrees, dispatched in one message) | 0 (no cherry-pick conflict) | yes, 4 tasks | 4/4 | 4 build-task, review-branch-deep, 1 fixer | $2.54 |

Change 7 roughly halved the build phase, from 302 s to 153 s, with no conflict repairs. It gained nothing on the whole cell: in this run the branch also went on to a deep branch review and one fix (471 s after the wave), which main's run skipped, so its total came to 2.1x main's wall-clock and 1.8x its tokens, and its lead peak was 25% higher (78k against 63k). With n=1 per arm, this run does not show whether that review step comes from change 7.
