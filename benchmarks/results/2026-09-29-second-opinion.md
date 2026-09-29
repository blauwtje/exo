# Second opinion on competing shapes: branch against main

Change 5 (Task 23): when spec's architecture sketch leaves two viable shapes, a fresh agent on the other tier judges them blind, and spec reports where the two verdicts disagree. Each arm ran once on 2026-09-29.

- Arms: `branch` is `eight-behaviors`; `main` is `origin/main` at `a70f0fd`, a detached worktree loaded with `--plugin-dir`.
- Plan cells: `node benchmarks/sweep.mjs --set plan --confirm --concurrency 3`, which sets `plan-opus-high` (`--model claude-opus-5-5 --effort high`), `plan-fable-high` (`--model claude-fable-5-1 --effort high`) and `plan-fable-xhigh` (`--model claude-fable-5-1 --effort xhigh`).
- Two-shapes case: `node benchmarks/pressure/drive.mjs F opus with`, with effort `high` set by the script, in `fx-booking-reminders`, with the scripted replies `ok` then `go`. The branch's blind verdict ran on `sonnet`, which the transcript records as `claude-sonnet-5-5`.
- Lead peak is the largest main-thread context of one message, computed by the branch's `benchmarks/cell-usage.mjs` for both arms. Total tokens are input, cache reads, cache writes and output, summed over the lead and every subagent. Wall-clock comes from the result's `duration_ms`.
- F, main: the drive sent `go` after turn 2, and main then built the plan until the 360 s turn timeout. The F row counts turns 1 and 2 only, the same turns the branch ran. With turn 3 the session totals 1,788,845 tokens and a lead peak of 56,582.

| Cell | Arm | Lead peak | Total tokens | Wall-clock | Second judge ran | Disagreement reported | Seeded flaw caught |
|---|---|---:|---:|---:|---|---|---|
| plan-opus-high | main | 29,893 | 153,830 | 47 s | n/a | n/a | n/a |
| plan-opus-high | branch | 32,300 | 274,409 | 54 s | no | no | n/a |
| plan-fable-high | main | 32,492 | 241,759 | 73 s | n/a | n/a | n/a |
| plan-fable-high | branch | 33,788 | 216,757 | 78 s | no | no | n/a |
| plan-fable-xhigh | main | 40,284 | 243,685 | 200 s | n/a | n/a | n/a |
| plan-fable-xhigh | branch | 77,892 | 2,810,485 | 800 s | no | no | n/a |
| F two-shapes | main | 38,864 | 403,265 | 83 s | n/a | n/a | yes: the reason under the recommendation says only appointments can turn a stored slot into a clock time |
| F two-shapes | branch | 45,730 | 675,026 | 134 s | yes, on sonnet | no: both verdicts picked "inside appointments" | partly: the blind judge named the slot decoding, but the user's question did not |

The branch's `plan-fable-xhigh` cell went past planning. It dispatched four `build-task` agents, one `general-purpose` agent and a `review-branch-deep` agent, which accounts for its size. None of the three branch plan cells mentions a blind verdict in its lead transcript.

Verdict: change 5 caught nothing that main missed. Main named the leak in its own recommendation, and on the branch the blind verdict agreed with the lead, so spec had no disagreement to report. On the two-shapes case the branch cost 271,761 more tokens than main (+67%), 6,866 more lead-peak tokens and 51 s more wall-clock.
