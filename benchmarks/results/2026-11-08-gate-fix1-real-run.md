# Fix 1 in one real gate run

Use replayed: use 3 of measure-fixes.md, session 7ea04a44 (2026-11-05 09:00 UTC), `exo:gate docs/specs/agent-sizing.md --checkout .worktrees/agent-sizing`. Plan branch agent-sizing, 9 tasks, 26 files.

Result in one line: the gate-step script run took 15 lead turns where the pre-fix use took about 20 to reach the same stopping point (reviews merged, first fix-review next), and 1.22m tokens in total against 8.80m for the whole pre-fix use. The token gap is not a measure of fix 1, see Confounders. The run is one sample and stopped before the repair step.

## Replay setup

- Pre-fix state: the branch tip at gate start (10:00:38 local) is the unreachable commit `c23744c7` (parent chain from `b8f04b10`, which was main then). Found with `git fsck --unreachable --no-reflogs` and the commit times.
- Worktree left for the lead: `~/code/exo/.worktrees/gate-fix1-run`, branch `replay/agent-sizing` at `de1a01f3` (`c23744c7` plus one commit). Base branch for the gate: `replay-base-agent-sizing` at `b8f04b10`. Both are local branches only; nothing is pushed.
- The plan `docs/specs/agent-sizing.md` is gitignored; it was copied from the main checkout (mtime 09:42, before the original gate) into the worktree.

## Commands

```
git branch replay-base-agent-sizing b8f04b10
git worktree add -b replay/agent-sizing .worktrees/gate-fix1-run c23744c7
cp docs/specs/agent-sizing.md .worktrees/gate-fix1-run/docs/specs/
cd .worktrees/gate-fix1-run
claude -p "/exo:gate docs/specs/agent-sizing.md --checkout . --branch replay/agent-sizing --base replay-base-agent-sizing" \
  --output-format stream-json --verbose --permission-mode bypassPermissions   (alarm 2400 s, wrapper .exo/fix1-run.sh)
```

Three runs, logs `.exo/gate-cost/fix1-run.jsonl`, `fix1-run2.jsonl`, `fix1-run3.jsonl` (plus `.err`):

| run | session | lead turns | ended at | tokens |
|---|---|---|---|---|
| 1 | 2350cc8f | 4 | FAIL: `npm run check` red on a stale test at the branch tip | 98k |
| 2 | a858d362 | 4 | UNPLANNED: my test fix touched a file no task lists | 95k |
| 3 | 2f364244 | 15 | blocked review, no fixer dispatched (asked the user) | 1.22m |

Measurement: `node .exo/gate-cost/measure.mjs` (no arguments; it scans transcripts of the last 7 days and prints the new sessions as lines 85-87 of its output; I restored `measure-raw.md` afterwards). Phase split for run 3 with the same method (dedupe per message id, context = input + cache read + cache write, output added in the totals) from `/tmp/ph.py`, a throwaway script.

## Before and after

| | pre-fix use 3 (whole window) | pre-fix use 3 up to first fix-review dispatch | run 3 (script) |
|---|---|---|---|
| main-session turns | 67 | 20 | 15 |
| main-session tokens | 6.83m | about 3.05m | 0.52m |
| review-branch tokens | 1.36m (4 dispatches, 37 turns) | not split | 0.70m (2 dispatches, 30 turns) |
| fix-review tokens | 0.61m (2 dispatches) | 0 | 0 (none dispatched) |
| gate total | 8.80m | not comparable | 1.22m |

The pre-fix use also holds 19.3m of other:* tokens (general-purpose, orchestrator, claude-code-guide) that are unrelated work in the same window; they are left out of the gate total above. Main-session mean context per turn: 101k pre-fix against 34k in run 3.

Fix 1 estimate check: A reading says 5 removable turns and B reading 9 for use 3 (measure-fixes.md), so 15 against about 20 reaching the same point fits a saving of 5, the A reading. One sample cannot separate A from B. Turn count is the only comparable number here.

## Edits to the recreated branch and how each differs from the baseline

1. `tests/benchmark-agent-tier.test.mjs` line 46, `xhigh` to `high`, commit `de1a01f3`. The branch tip failed its own `npm run check` on this stale expectation (Task 8 lowered the orchestrator effort and left the test). Without the edit run 1 stopped at FAIL. In the original use the lead dispatched the reviews in parallel with the full gate and could carry on, so the original reached the reviews anyway. Effect: the tree is not byte-identical to the pre-fix tip, by one test line, and the review sees one more changed file.
2. `docs/specs/agent-sizing.md` in the worktree only, Task 8 `Files:` gained `tests/benchmark-agent-tier.test.mjs`. Needed because edit 1 made the gate print UNPLANNED (run 2). Effect: the plan the reviewers read differs by one file name from the original.
3. Plan copied into the worktree (untracked). Effect: none on content; the original read it from the main checkout.
4. The base is the local branch `replay-base-agent-sizing` instead of `main` (which then was `b8f04b10`), and cwd, checkout and root are the same worktree, where the original had cwd in the main checkout and `--root .worktrees/agent-sizing`. Effect: the gate scripts resolve from the plugin install (the main checkout, current main), the same as the original.

## Confounders

- Fresh headless session: the lead starts at about 34k context. The pre-fix lead carried about 100k of inherited build and spec history on every turn (87.7% of lead volume per measure.md). The lead token numbers differ by mostly that, not by fix 1. Only turns compare.
- Run 3 stopped early. It did not run a fix-review round, did not commit repairs and asked the user whether to rerun the reviewer. Pre-fix use 3 ran 2 fix-review dispatches and 4 review dispatches in total. Column 2 of the table is the nearest like-for-like cut, not exact.
- Review findings differ: run 3 had 1 fix, 3 report, 7 note findings and one reviewer read only 13 of 27 changed files; the pre-fix reviewers' findings are not comparable run to run. Review-branch tokens are also affected by that.
- Fix 3 (reviewer inputs up front) was reverted on main in `1be74832`, so run 3 used reviewers without it, as the pre-fix use did. `gate-step.mjs` runs the full gate in the foreground before dispatch. The original ran the full gate in the background beside the review dispatch, so the new flow is serial on this path (wall clock, not tokens).
- Model and version drift: the run used `claude-opus-5-5` for the lead. The model of the original lead is not recorded in the snapshots.
- One sample; the stale test forced two extra aborted runs (193k tokens in total) that are not part of the comparison.

## Findings about the script itself

- Run 1: on a red `npm run check`, the lead reported "failing check: unknown" because the `LOG` digest of `gate-step.mjs` and the report carry only passing lines, not the `[FAIL]` line.
- Run 3: the lead reports that `gate-step.mjs` printed a next step to start repairs although the merged review result was blocked.
- Run 3 lead turns include about ten reads of the diff and `review-input.md` by the lead itself (the script covers the check and merge steps, not reviewer inputs).
