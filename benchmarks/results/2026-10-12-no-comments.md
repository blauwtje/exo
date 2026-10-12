# exo benchmark: comment lines from one capped exo run

Measured whether code built by `exo run` adds comment lines after the no-comments rules (plan `docs/specs/no-comments.md`, Tasks 1-7). Target: 0 comment lines added and the hidden check still passing.

Setup: cell `flow-run` (Sonnet 5.5, `claude-sonnet-5-5`, effort high), fixture plan `docs/plans/text-helpers.md`, 4 tasks, n=1, cap $1 (the cell's `--max-run-usd`). Claude Code 2.1.296, Node v24.16.0, under `caffeinate -i`. Plugin commit `b5d54d1c`, branch `code-rules`.

Command, run once from the `code-rules` worktree by the lead, outside `exo run`:

```
caffeinate -i node benchmarks/sweep.mjs --set flow --cells flow-run --confirm
```

The values come from `commentStats` in `benchmarks/runs/2026-10-12-sweep/flow-run/record.json`, computed by `benchmarks/comment-count.mjs` while the cell repository still existed. This file is written by hand.

## Results

| Measure | Value |
|---|---|
| comment lines added | 0 |
| hook denials | 0 |
| hidden check | pass |
| tasks landed | 4 of 4 |
| cost | $0.151 |
| wall time | 43s |
| tokens | 63359 |

Target met: 0 comment lines added, hidden check passing.

## Limitations

- One cell, so the result shows the rules do not break a run; it does not show a rate.
- 0 hook denials means the edit-time hook never had to refuse a comment; the run alone does not show whether the model left comments out because of the rules or never wrote any.
- The first attempt ran inside `exo run` (run `20261012T082642-c177`, Task 8) and stopped with `sweep: flow-run: exo hooks did not run`; that nested `claude -p` measured nothing and is not counted.
