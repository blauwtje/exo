# Benchmarks

Paired headless runs that measure exo against a session without it. Running a plugin arm beside prompt-only control arms on one fixture is an idea taken from the agentic benchmark in [dietrichgebert/ponytail](https://github.com/dietrichgebert/ponytail); the tasks and the prompts here are exo's own.

Every cell is one `claude -p --output-format json` call on a fresh checkout of `tiangolo/full-stack-fastapi-template` at commit `cd83fc1`. `--setting-sources project,local` keeps your own plugins out of the cell and `--plugin-dir` loads exactly one.

## Arms

| Arm | What the cell gets |
|---|---|
| `baseline` | No plugin and no extra prompt. |
| `terse` | exo's terse-prose control prompt in `arms/terse.md`: short replies, with nothing said about code size. |
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

`score.mjs --publish` writes `benchmarks/results/<date>.md`, or the file `--results <file>` names, with the cut it measured per metric and the standard error of that cut. The savings record never reads these files: its panel reports measured figures only.

## Safe tasks

Each directory under `benchmarks/safe/` holds a seed, a reference solution and a check. `npm test` runs every check twice: it must fail against the seed and pass against the solution.

## Model and effort sweep

`node benchmarks/sweep.mjs` measures exo's routing on the models it names. Every cell is its own `claude -p --plugin-dir <this clone> --model <id> --effort <level>` process in a fresh repository:

| Set | Cells | Model and effort |
|---|---|---|
| `review` | 30: each `safe/` fixture as a branch carrying its seed, and as a control branch carrying its solution | Opus 5.5 at `low`, `medium` and `high` |
| `build` | 5: each `safe/` task built from its seed | Sonnet 5 at `high` |
| `fixer` | 5: each `safe/` task's review-fixer dispatch, from `review-fixer-prompt.md` | Sonnet 5 at `high` |
| `plan` | 3: one fixed request planned in a small text library | Opus 5.5 at `high`, Fable 5.1 at `high` and `xhigh` |
| `flow` | 1: a fixed four-task plan run through `implementing` (C7) | Sonnet 5 at `high` |

```bash
node benchmarks/sweep.mjs --set all                    # prints the 44 calls it would make and starts none
node benchmarks/sweep.mjs --set all --confirm          # runs them, two to three hours at the default --concurrency 2
node benchmarks/sweep.mjs --set review --confirm --out benchmarks/runs/<dir>   # one set; a rerun on the same --out skips finished cells
```

A review cell runs the body of the `branch-reviewer` agent as its own session, because the agent's frontmatter effort would override the effort under test. A seeded defect counts as found when the fixture's check passes after the review; every defect or hazard reported on a control branch counts as a false alarm. Each cell leaves `record.json` beside its raw output, and the run writes a dated `-sweep` results file under `results/` with the false-alarm rate and the winning plan cell. The run is local and opt-in: nothing starts without `--confirm`, and no CI job runs it.
