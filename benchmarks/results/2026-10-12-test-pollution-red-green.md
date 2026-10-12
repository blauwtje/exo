# exo value benchmark: test pollution, exo run with the red-green gate

Measured whether `exo run` with the red-green gate passes `value-test-pollution`, the task on which exo never passed on 2026-10-11 (`2026-10-11-test-pollution.md`). The task and its hidden check are the same as there: make the suite pass in any file order, tests unchanged; the hidden check runs the original tests in eight fixed file orders, then hidden unit tests that hit each of the three leaks.

Goal, from plan `docs/specs/autonomous-exo-5.md` (Decisions 2-4, Assumptions 6, 8, 9): arm `exo-run` only (task via `exo run` with the red-green gate), n=5, no baseline cells. Pass = at least 3 of 5 cells pass the hidden check. Cap $1.20 for the whole measurement. A cell not run counts as fail.

Setup: Sonnet 5.5 (`claude-sonnet-5-5`) at the CLI's default effort, Claude Code 2.1.296, fixture `full-stack-fastapi-template` at `cd83fc1`, `--concurrency 1`, under `caffeinate -i`. Plugin commit `32eaf050` for attempt 1, `4cc98979` for the rerun.

The numbers are what `node benchmarks/score.mjs <dir>` prints for the run directory; this file is written by hand. `defects` counts failed hidden checks (lower is better).

## Attempts

| Attempt | Time | Plugin commit | Run dir | Spend cap | Outcome |
|---|---|---|---|---|---|
| 1 | 09:21:23-09:23:05 | `32eaf050` | `benchmarks/runs/2026-10-12-custom` | `--max-total-usd 1.20` | Aborted by the lead in cell 1; no cell finished. |
| 2 | 09:25:34-09:27:32 | `4cc98979` | `benchmarks/runs/2026-10-12-red-green` | `--max-total-usd 0.83` (rest of the cap) | Cell 1 passed; cells 2-5 skipped by the cap rule. |

- **Attempt 1.** land-task refused task 1 for two reasons. The fixture plan said `Files: src` without `/`, and land-task only treats an entry ending in `/` as a folder. The confined child's TMPDIR sat inside the workdir, so a stray `tmp/isolated-zsh/.zcompdump` showed up as a change. Every cell would have failed at landing. Spend: plan session $0.205 (from `sessions.jsonl`) plus the killed task-retry session, about $0.13-0.16 (from its transcript tokens; the driver did not record it), about $0.37 in all. Fixed in `4cc98979`: `Files: src/`, `/tmp/` in the workdir's `.git/info/exclude`, and tests.
- **Attempt 2.** Run log of cell 1: task 1 landed in 65s ($0.19, 23 turns), `Red-green: proved`, final review FINDINGS, a fix session, then `run stopped: Landing the review fix failed: land-task: no changed path to commit`. exo run reported stopped although the task was landed; the hidden check scores the landed branch. The driver then skipped cells 2-5: spent $0.418 plus an expected $0.418 for the next cell passes $0.83.

## Results

| Arm | n | errors | pass | defects | LOC added | tokens | cost | wall time | cost / success |
|---|---|---|---|---|---|---|---|---|---|
| exo-run | 1 | 0 | 100% | 0.0 | 14 | 180k | $0.42 | 1.9m | $0.42 |

The one cell: hidden check passed, 0 of 15 defects, 14 lines added, 180k tokens, $0.418, 117s.

## Against the goal

- **1 of 5: goal missed.** 1 cell passed and 4 were not run, which count as fail. Pass needed 3 of 5.
- **The cap decided it, not the pass rate.** Total spend about $0.79 of $1.20 (about $0.37 in attempt 1, $0.418 in attempt 2). At about $0.42 per cell, at most 2 cells fit in the rest of the cap, so 3 of 5 could not be reached within $1.20 at this cell cost.
- **Comparison.** On 2026-10-11 the baseline passed 1 of 35 and the old exo arm 0 of 35. This is the first exo pass on this task, from one finished cell.
- **Sleep.** `pmset -g log` shows no sleep or wake entry between 09:20 and 09:29; the machine did not sleep.

## Findings

- **The finished exo-run cell passed.** It is the first exo pass on `value-test-pollution`, with 0 defects. One cell is not a rate.
- **A measurement that can reach 3 of 5 needs a larger cap or a cheaper tail.** 5 cells at about $0.42 need about $2.10. Of the $0.42, the review and fix sessions cost about $0.23.
- **The review-fix path stops the run on an empty fix.** When the fixer changes nothing, landing the fix fails with `no changed path to commit` and exo run reports stopped, although the task itself was landed.

## Decision

Stop rule (Decision 3): the goal is missed, so change 5 does not land. The branch `feat/exo-red-green` and its worktree stay.

## Limitations

- n=1 finished cell. Pass 100% is one cell; it says nothing about the rate.
- One task, one fixture, no baseline cells in this run; the comparison is with the 2026-10-11 runs.
- Raw cells sit in `benchmarks/runs/2026-10-12-custom` and `benchmarks/runs/2026-10-12-red-green`, which are git-ignored and live only on this machine. This file is the record.
