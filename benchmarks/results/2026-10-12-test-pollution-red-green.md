# exo value benchmark: test pollution, exo run with the red-green gate

Measured whether `exo run` with the red-green gate passes `value-test-pollution`, the task on which exo never passed on 2026-10-11 (`2026-10-11-test-pollution.md`). The task and its hidden check are the same as there: make the suite pass in any file order, tests unchanged; the hidden check runs the original tests in eight fixed file orders, then hidden unit tests that hit each of the three leaks.

Goal, from plan `docs/specs/autonomous-exo-5.md` (Decisions 2-4, Assumptions 6, 8, 9): arm `exo-run` only (task via `exo run` with the red-green gate), n=5, no baseline cells. Pass = at least 3 of 5 cells pass the hidden check. A cell not run counts as fail. Cap $1.20 for the first measurement; after it ran out at 1 cell, the user added 4 cells under a cap of $1.80.

Setup: Sonnet 5.5 (`claude-sonnet-5-5`) at the CLI's default effort, Claude Code 2.1.296, fixture `full-stack-fastapi-template` at `cd83fc1`, `--concurrency 1`, under `caffeinate -i`. Plugin commit `32eaf050` for attempt 1, `4cc98979` for attempt 2, `6f461c8b` for attempt 3. `6f461c8b` only adds this file on top of `4cc98979`, so attempts 2 and 3 ran the same code.

The numbers are what `node benchmarks/score.mjs <dir>` prints for each run directory; the combined row is summed by hand from those cells. This file is written by hand. `defects` counts failed hidden checks (lower is better).

## Attempts

| Attempt | Time | Plugin commit | Run dir | Spend cap | Outcome |
|---|---|---|---|---|---|
| 1 | 09:21:23-09:23:05 | `32eaf050` | `benchmarks/runs/2026-10-12-custom` | `--max-total-usd 1.20` | Aborted by the lead in cell 1; no cell finished. |
| 2 | 09:25:34-09:27:32 | `4cc98979` | `benchmarks/runs/2026-10-12-red-green` | `--max-total-usd 0.83` (rest of the cap) | Cell 1 passed; cells 2-5 skipped by the cap rule. |
| 3 | 09:32:30-09:39:48 | `6f461c8b` | `benchmarks/runs/2026-10-12-red-green-2` | `--max-total-usd 1.80`, `--runs 4` | 4 of 4 cells passed; none skipped; spent $1.455. |

- **Attempt 1.** land-task refused task 1 for two reasons. The fixture plan said `Files: src` without `/`, and land-task only treats an entry ending in `/` as a folder. The confined child's TMPDIR sat inside the workdir, so a stray `tmp/isolated-zsh/.zcompdump` showed up as a change. Every cell would have failed at landing. Spend: plan session $0.205 (from `sessions.jsonl`) plus the killed task-retry session, about $0.13-0.16 (from its transcript tokens; the driver did not record it), about $0.37 in all. Fixed in `4cc98979`: `Files: src/`, `/tmp/` in the workdir's `.git/info/exclude`, and tests.
- **Attempt 2.** Run log of cell 1: task 1 landed in 65s ($0.19, 23 turns), `Red-green: proved`, final review FINDINGS, a fix session, then `run stopped: Landing the review fix failed: land-task: no changed path to commit`. exo run reported stopped although the task was landed; the hidden check scores the landed branch. The driver then skipped cells 2-5: spent $0.418 plus an expected $0.418 for the next cell passes $0.83.
- **Attempt 3.** The user's added 4 cells, same setup. Every cell logged `Red-green: proved`. Cells 1, 2 and 4 ended with the same `run stopped: Landing the review fix failed: land-task: no changed path to commit`; cell 3 ended `run done`.

## Results

| Run | n | errors | pass | defects | LOC added | tokens | cost | wall time | cost / success |
|---|---|---|---|---|---|---|---|---|---|
| attempt 2 | 1 | 0 | 100% | 0.0 | 14 | 180k | $0.42 | 1.9m | $0.42 |
| attempt 3 | 4 | 0 | 100% ±0% | 0.0 ±0.0 | 12 ±0 | 154k ±18k | $0.36 ±$0.04 | 1.8m ±0.2m | $0.36 |
| combined | 5 | 0 | 100% | 0.0 | 12.6 | about 159k | $0.37 | 1.8m | $0.37 |

Attempt 3 cells: $0.387 / 111s, $0.405 / 120s, $0.239 / 72s, $0.424 / 133s; each 0 of 15 defects. Combined cell spend $1.873 over 553s of cell time.

## Against the goal

- **5 of 5: goal met.** All five finished cells passed the hidden check with 0 of 15 defects. Pass needed 3 of 5.
- **Spend.** Cells $1.873 (attempt 2 $0.418, attempt 3 $1.455); with attempt 1's about $0.37, about $2.24 in all, against caps of $1.20 plus $1.80. Attempt 3 stayed under its $1.80 cap.
- **Comparison.** On 2026-10-11 the baseline passed 1 of 35 and the old exo arm 0 of 35, on the same task and hidden check.
- **Sleep.** `pmset -g log` shows no sleep or wake entry between 09:20 and 09:29 or between 09:32 and 09:40; the machine did not sleep.

## Findings

- **exo run with the red-green gate passed 5 of 5.** Every cell logged `Red-green: proved` and passed with 0 defects.
- **The review-fix path stops the run on an empty fix.** In 4 of 5 cells the fixer changed nothing, landing the fix failed with `no changed path to commit`, and exo run reported stopped, although the task was landed and passed. A run that reports stopped after a passing landing misleads the user; this needs a fix, separate from change 5.
- **The tail is most of the cost.** Of about $0.42 per cell in attempt 2, the review and fix sessions cost about $0.23. Cell 3 of attempt 3, the one that ended `run done`, cost $0.239.

## Decision

Goal met (Decision 3): 5 of 5 cells passed, at least 3 needed. Change 5 is ready to land per the repo's `CLAUDE.md`.

## Limitations

- n=5 cells over two runs of the same code (`4cc98979` and `6f461c8b` differ only in this file). A 5 of 5 pass says the rate is high, not how high.
- One task, one fixture, no baseline cells in these runs; the comparison is with the 2026-10-11 runs.
- Raw cells sit in `benchmarks/runs/2026-10-12-custom`, `benchmarks/runs/2026-10-12-red-green` and `benchmarks/runs/2026-10-12-red-green-2`, which are git-ignored and live only on this machine. This file is the record.
