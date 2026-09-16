# Benchmarks

Paired headless runs that measure exo against a session without it. The design follows the agentic benchmark in [dietrichgebert/ponytail](https://github.com/dietrichgebert/ponytail); the template tasks and the no-run instruction are reused from it verbatim under its MIT license (see `THIRD_PARTY_NOTICES.md` at the repository root).

Every cell is one `claude -p --output-format json` call on a fresh checkout of `tiangolo/full-stack-fastapi-template` at commit `cd83fc1`. `--setting-sources project,local` keeps your own plugins out of the cell and `--plugin-dir` loads exactly one.

## Arms

| Arm | What the cell gets |
|---|---|
| `baseline` | No plugin and no extra prompt. |
| `terse` | The terse-prose control prompt in `arms/terse.md`: the caveman skill text, as ponytail ships it. |
| `yagni-oneliner` | One sentence asking for YAGNI and one-liners. |
| `exo` | This plugin, loaded from the working tree. |

## Running

```bash
node benchmarks/run.mjs --smoke                   # one template task and one safe task, every arm, n=1
node benchmarks/run.mjs --full                    # prints the cost projection from the last smoke run, then stops
node benchmarks/run.mjs --full --confirm          # every task, every arm, n=4
node benchmarks/run.mjs --tasks calib-reply --arms baseline,exo --runs 6 --concurrency 1   # the calibration cells
node benchmarks/score.mjs benchmarks/runs/<dir>   # rescore a run offline and print one table
```

`--model` picks the model every cell runs on; the default is `haiku`. A run larger than smoke costs money, which is why `--full` stops at the projection until `--confirm` is given.

## Output

Raw cells land in `benchmarks/runs/<date>-<mode>/`, which is git-ignored. Each cell holds:

- `result.json`, the harness's own output for the call;
- `checks.json`, the verdict of the task's checks against the diff;
- `usage.json`, the usage summed over every transcript of the cell, subagents included, because the result's usage block covers the main thread only. `node benchmarks/backfill-usage.mjs <run>` writes it for older cells while their transcripts still exist.

`score.mjs --publish` writes `benchmarks/results/<date>.md`, or the file `--results <file>` names, with the cut it measured per metric and the standard error of that cut. The savings ledger never reads these files: its panel reports measured figures only.

## Safe tasks

Each directory under `benchmarks/safe/` holds a seed, a reference solution and a check. `npm test` runs every check twice: it must fail against the seed and pass against the solution.
