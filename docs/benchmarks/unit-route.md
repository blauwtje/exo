**Not landed.** The unit route did not land, despite the lower cost below. Arm 2 was 12.1% slower in median wall clock, and the user's constraint is time, not consumption: their 7-day usage is only 3%. In addition, for plans of 8 tasks or fewer the builders' `Choice:` lines disappear, because `skills/build/scripts/land-task.mjs` writes the decision log only for plans above 8 tasks. Arm 3 (Sonnet as main session) scored 21 blind against 24 for arm 1 (median).

Arm 2 lands. When build runs every plan through `exo:run-unit`, a run costs a median of 1.3093 against 1.4670 USD (-10.7%), and every arm-2 run (1.2010-1.3399) cost less than every arm-1 run (1.4537-1.5048). The main session became 38.5% cheaper. Quality counts as equal: all nine final checks pass, all 5 tasks landed in every run, no task got stuck, and every review found exactly one defect, in every run the same process rule and no code error. The median number of review findings is 2 against 3, and arm 2 had the same number of fix rounds or fewer. The blind score is one point lower in the median, 23 against 24, with the same range 22-24 and a mean of 23.0 against 23.3. That difference falls within the spread of n=3. Arm 2 is not faster: the median wall clock was 12.1% longer, because the step through run-unit adds an extra serial level. Arm 3, with the main session on Sonnet, is the cheapest (-21.1%), but scores lower blind (median 21, range 21-23), and `exo:review-branch-deep` still runs on Opus there.

# Benchmark unit-route: exo v0.77.0 (e274f33f) on Opus and on Sonnet against the branch unit-route (69f33f10), 2026-10-03

This report compares three arms on the same task. Arm 1 is main e274f33f (v0.77.0) with the main session on `--model opus`. For a plan of 5 tasks, build chooses the direct route there. Arm 2 is the branch `unit-route` at 69f33f10, where `skills/build/scripts/next-task.mjs` always prints `Route: unit`, so a plan of 8 tasks or fewer also goes to `exo:run-unit` on Sonnet. The main session runs on `--model opus`. Arm 3 is main e274f33f with the main session on `--model sonnet`, which is what exo's `/model sonnet` line asks for the next step. Each run starts with a warm-up `npm test` in the prompt, then runs `exo:build` on `docs/plans/business-invoices.md` and ends with `exo:verify`, on the TypeScript fixture with the plan `new` (5 tasks). Each arm ran three times, in the order 1-2-3, repeated three times, and the whole series ran under `caffeinate -i`. The run directories are in `/Users/thomash/bench-runs/unit-route/`.

An earlier probe showed that a `model:` line in build's SKILL.md does not keep the main session on Sonnet (see [skill-model-field.md](skill-model-field.md)). Arm 3 therefore measures the session-level switch `/model sonnet`.

Every number names its source. `meta.json`, `stdout.json` and `repo/.exo/branch-review.md` are per run in `/Users/thomash/bench-runs/unit-route/<arm-dir>/<run>/`, and `metrics.json` per arm in `/Users/thomash/bench-runs/unit-route/<arm-dir>/`. The arm directories are `arm1-opus-direct`, `arm2-opus-unit` and `arm3-sonnet-direct`. The cost per segment, the model per call, the route and the quality table come from `/Users/thomash/bench-runs/unit-route/ANALYSIS.md` (data in `analysis.json` next to it), which extracts them from the transcripts under `~/.claude/projects/-Users-thomash-bench-runs-unit-route-<arm-dir>-<run>-repo/`. The setup, the times and the sleep check are in `/Users/thomash/bench-runs/unit-route/RUNNER.md`. The blind scores come from `/tmp/ur-blind/judgement.md`, unblinded with `/Users/thomash/bench-runs/unit-route/blind-key.txt`.

Differences are computed from the medians as `(arm - arm 1) / arm 1 x 100`. Example for the cost of arm 2: `(1.3093 - 1.4670) / 1.4670 x 100 = -10.7%`.

## Main table per arm

Median with range (min-max) over n=3 runs per arm.

| Measure | Arm 1: Opus, direct | Arm 2: Opus, unit | Arm 3: Sonnet, direct | Arm 2 vs 1 | Arm 3 vs 1 | Source |
|---|---|---|---|---|---|---|
| Wall clock (s) | 446.8 (397.6-521.9) | 500.9 (401.1-550.9) | 402.4 (360.7-417.5) | +12.1% | -9.9% | meta.json `wallMs` |
| Cost total (USD) | 1.4670 (1.4537-1.5048) | 1.3093 (1.2010-1.3399) | 1.1580 (1.1434-1.2386) | -10.7% | -21.1% | stdout.json `total_cost_usd` |
| Cost main session (USD) | 0.8109 (0.7785-0.8146) | 0.4985 (0.4598-0.5145) | 0.5393 (0.4749-0.5748) | -38.5% | -33.5% | ANALYSIS.md "Main cost": usage of the main transcript x `benchmarks/prices.mjs` |
| API calls main session | 35 (35-36) | 22 (21-23) | 34 (34-37) | -37.1% | -2.9% | ANALYSIS.md "Main API calls", deduplicated on `message.id` |
| Tokens main session | 1,327,859 (1,304,591-1,368,128) | 669,236 (626,609-709,799) | 1,260,314 (1,224,790-1,438,894) | -49.6% | -5.1% | ANALYSIS.md "Main tokens total" |
| Cost `exo:run-unit` (USD) | 0 | 0.1661 (0.1590-0.1686) | 0 | n/a | n/a | ANALYSIS.md "run-unit cost", subagents with `agentType` `exo:run-unit` |
| Cost other subagents (USD) | 0.6886 (0.6427-0.6902) | 0.6423 (0.5704-0.6581) | 0.6830 (0.5687-0.6993) | -6.7% | -0.8% | ANALYSIS.md "Other subagents cost" |
| Review findings (defect+hazard+question) | 3 (2-3) | 2 (1-3) | 2 (1-3) | -33.3% | -33.3% | metrics.json `quality.reviewerReturn` |
| Review defects | 1 (1-1) | 1 (1-1) | 1 (1-1) | 0.0% | 0.0% | same |
| Fix rounds | 1 (1-1) | 1 (0-1) | 1 (0-1) | 0.0% | 0.0% | metrics.json `quality.fixRounds` |
| Tasks landed (of 5) | 5 (5-5) | 5 (5-5) | 5 (5-5) | 0.0% | 0.0% | metrics.json `quality.landedTasks` |
| Blind score (of 25) | 24 (22-24) | 23 (22-24) | 21 (21-23) | -1 point (-4.2%) | -3 points (-12.5%) | judgement.md, column `Sum` of "Scores", unblinded with blind-key.txt |

The costs of arm 2 do not overlap with those of arm 1: the most expensive arm-2 run (05-new, 1.3399) cost less than the cheapest arm-1 run (07-old, 1.4537). The wall clock does overlap. The median of arm 2 (500.9 s) lies within the range of arm 1 (397.6-521.9 s).

## Per run

| Run | Arm | Wall (s) | Cost USD | Main session USD | Main session calls | run-unit USD | Review d/h/q, fix | Fix rounds | Tree, blind score |
|---|---|---|---|---|---|---|---|---|---|
| 01-old | 1 | 521.9 | 1.4670 | 0.7785 | 35 | 0 | 1/2/0, fix=2 | 1 | D, 24 |
| 02-new | 2 | 401.1 | 1.2010 | 0.4598 | 21 | 0.1590 | 1/0/0, fix=0 | 0 | E, 24 |
| 03-old | 3 | 360.7 | 1.1434 | 0.5748 | 34 | 0 | 1/0/0, fix=0 | 0 | I, 21 |
| 04-old | 1 | 446.8 | 1.5048 | 0.8146 | 35 | 0 | 1/1/1, fix=2 | 1 | A, 24 |
| 05-new | 2 | 550.9 | 1.3399 | 0.5145 | 23 | 0.1661 | 1/1/1, fix=2 | 1 | G, 23 |
| 06-old | 3 | 417.5 | 1.1580 | 0.4749 | 34 | 0 | 1/1/0, fix=1 | 1 | H, 23 |
| 07-old | 1 | 397.6 | 1.4537 | 0.8109 | 36 | 0 | 1/1/0, fix=1 | 1 | F, 22 |
| 08-new | 2 | 500.9 | 1.3093 | 0.4985 | 22 | 0.1686 | 1/1/0, fix=1 | 1 | C, 22 |
| 09-old | 3 | 402.4 | 1.2386 | 0.5393 | 37 | 0 | 1/1/1, fix=2 | 1 | B, 21 |

Sources: meta.json `wallMs`, stdout.json `total_cost_usd`, ANALYSIS.md "Per run" for the main session and run-unit, metrics.json `quality.reviewerReturn` and `quality.fixRounds`, and judgement.md with blind-key.txt for tree and score. All nine runs ended with exit code 0, without a timeout, with stdout.json `subtype: success` and `is_error: false` (RUNNER.md, "Runs").

## Model per call in the main session

In arm 1 and arm 2, every call of the main session ran on `claude-opus-5-5`: 35, 35 and 36 calls in arm 1, and 21, 23 and 22 in arm 2. In arm 3, every call ran on `claude-sonnet-5-5`: 34, 34 and 37. Source: `message.model` of every assistant line in the main transcript, deduplicated on `message.id` (ANALYSIS.md, "Model per call, main session").

The subagents follow their own agent definition, not the session. `exo:build-task`, `exo:fix-review` and `exo:run-unit` ran on `claude-sonnet-5-5` in all arms, and `exo:review-branch-deep` on `claude-opus-5-5` in all arms (ANALYSIS.md, "Subagent segments per run, by agentType"). In arm 3 that Opus part cost 0.2654-0.3068 USD per run (stdout.json `modelUsage.claude-opus-5-5.costUSD`).

## Route and dispatches

The main transcripts of arm 1 and arm 3 show only `Route: direct`, those of arm 2 only `Route: unit`. Source: the regex `^Route:` over the tool results of `next-task.mjs` (ANALYSIS.md, "Route and dispatches").

In every run all 5 tasks went exactly once to `exo:build-task`. In arm 1 and arm 3 the main session dispatched those five itself. In arm 2 the main session dispatched one `exo:run-unit`, and that dispatched the five build-tasks. Every run had one `exo:review-branch-deep`, because task 1 carries `Risk: public signature`, and no `exo:review-branch`. `exo:fix-review` ran once, except in 02-new and 03-old. There was no dispatch of `exo:solve-hard`, general-purpose or bug-fixer.

The saving of arm 2 is in the main session. It made a median of 22 calls against 35, and read 633,516 tokens from the cache against 1,274,405 (-50.3%, ANALYSIS.md "Main tokens cache read"). Against that stands run-unit, with 16 calls on Sonnet and 0.1590-0.1686 USD per run. The build-tasks cost almost the same in both arms: median 0.3228 against 0.3243 USD (ANALYSIS.md "build-task cost").

## Quality

Final check. In all nine runs, `npm test`, `npm run typecheck` and lint passed on the final commit, which equaled HEAD in a clean checkout (metrics.json `quality.recheck.results`, P/P/P in ANALYSIS.md "Quality").

Blind score. A judge received the nine final trees as A through I, without knowing which run belongs to which letter, and gave each 0-5 points on five criteria: correctness, the signature change, test quality, clarity and scope. Unblinded with blind-key.txt:

| Arm | Runs and trees | Scores | Median (min-max) | Mean |
|---|---|---|---|---|
| 1 | 01-old D, 04-old A, 07-old F | 24, 24, 22 | 24 (22-24) | 23.3 |
| 2 | 02-new E, 05-new G, 08-new C | 24, 23, 22 | 23 (22-24) | 23.0 |
| 3 | 03-old I, 06-old H, 09-old B | 21, 23, 21 | 21 (21-23) | 21.7 |

The median of arm 2 is one point below that of arm 1, with the same range. The judge calls the differences between all trees small. They lie in edge cases and in test depth: every tree passes typecheck, lint and its own tests, and the tests kill 15 to 18 of 19 mutations (judgement.md, "Ranking" and "Mutation check of test quality"). Two trees throw a RangeError on an order without lines, which the starting code did build: E (02-new, arm 2) and I (03-old, arm 3) (judgement.md, "Probe findings").

Review findings. Every review found exactly one defect, and in all nine runs it is the same process rule: the implementation report `.exo/implementer-1.md` of task 1 (`Risk: public signature`) cites only the passing run `npm test -- tests/tax.test.ts` (4 pass, 0 fail) and no failing run before it (`repo/.exo/branch-review.md` of each run). That is not an error in the code. The reviewer gave this defect the action `report` each time, so fix-review does not repair it. That is why 02-new and 03-old, where this was the only finding, had `fix=0` and no fix round. The other findings are hazards and questions: median 3 in arm 1 against 2 in arm 2 and arm 3 (metrics.json `quality.reviewerReturn`).

Fix rounds. Arm 1 had one fix round in every run, arm 2 and arm 3 each in two of the three runs (metrics.json `quality.fixRounds`). Every fix round produced one fix commit and one regate (`quality.fixCommits`, `phases.regate.runs`).

Stuck tasks. None. All 5 tasks landed in all nine runs (`quality.landedTasks`, `allTasksLanded` true), every subagent transcript ends with a final report, and no transcript contains a `PLAN DRIFT: Task` refusal from land-task (ANALYSIS.md, "Quality" and deviation 7).

## Sleep check

The Mac did not sleep during the series. `pmset -g log` shows in the window from the first start to the last end, 11:41:35 to 12:48:20 local time (+0200), no `Sleep`, `Wake` or `DarkWake` event at all. There are only two `Display is turned off` lines, at 11:47:33 and 11:53:27, and the display came back on at 11:48:26 and 11:55:07. `caffeinate -i` kept the system awake. Sources: `/Users/thomash/bench-runs/unit-route/pmset-window.txt` and RUNNER.md, "Sleep check". A broader text search found 59 more lines, all `Assertions` with "Sleep" in the name of the assertion and no real sleep (`pmset-window-loose.txt`).

## What can make the comparison unfair

- n=3 per arm. The blind-score difference of one point in the median falls within the spread of both arms, and the wall clock of arm 1 and arm 2 overlaps. Only the costs separate the arms without overlap.
- One plan of 5 tasks on one fixture. A plan with more or heavier tasks was not measured. On main, a plan of more than 8 tasks (`BLOCK_TASK_LIMIT`) already goes to run-unit, so the branch changes the route only for plans of 8 tasks or fewer (`git diff e274f33f 69f33f10 -- skills/build/scripts/next-task.mjs`).
- Arm 3 does not run entirely on Sonnet. Only the main session switches, and `exo:review-branch-deep` stays on Opus through its agent definition. The arms therefore differ only in the main session's model and the route.
- In arm 2 the transcripts do not fully reconcile with the bill. In 02-new, stdout.json `modelUsage.claude-opus-5-5` counts 26,701 tokens and 0.0117 USD more than the transcripts, in 05-new 119 Sonnet tokens and 0.0012 USD (ANALYSIS.md, deviation 1). The split across main session, run-unit and other subagents can therefore be too low by up to that amount. The total comes from `total_cost_usd`, and the gaps are smaller than the distance between the most expensive arm-2 run and the cheapest arm-1 run.
- metrics.json `quality.findings` reads the `Count:` line of the report, and in 01-old, 04-old, 05-new and 09-old that line names only `defect=1`. This report therefore counts the findings from the reviewer's reply line (`quality.reviewerReturn`, ANALYSIS.md deviation 2).
- The order was fixed (1-2-3, three times), not random. Each arm stood in the same place in every round.
- The blind scores come from one judge in one round.

## Reproduce

The bench worktrees:

```
git worktree add --detach .worktrees/bench-old e274f33f
git worktree add --detach .worktrees/bench-new 69f33f10
```

The series, from `/Users/thomash/bench-runs/unit-route`:

```
caffeinate -i bash /Users/thomash/bench-runs/unit-route/series.sh > series.out 2>&1
```

`series.sh` runs from the main checkout of exo nine times, one run at a time, in the order arm 1, 2, 3, 1, 2, 3, 1, 2, 3. A run of arm 2 is, for example:

```
node benchmarks/lean-gates.mjs --version new --model opus --plan new --timeout-min 30 --run 2 --out /Users/thomash/bench-runs/unit-route/arm2-opus-unit
```

Arm 1 uses `--version old --model opus`, arm 3 `--version old --model sonnet`. Effort `medium` and budget 30 USD per run are the defaults (meta.json `effort`, `budget`). Claude Code 2.1.288 (meta.json `claudeVersion`), with `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` and `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`.

The metrics per arm, which write `metrics.json` in the arm directory:

```
node benchmarks/lean-gates-metrics.mjs /Users/thomash/bench-runs/unit-route/<arm-dir>
```

The analysis, which writes `analysis.json` and `ANALYSIS.md`:

```
node /Users/thomash/bench-runs/unit-route/scripts/analyze.mjs
node /Users/thomash/bench-runs/unit-route/scripts/render.mjs
```

The blind set, which writes `/tmp/ur-blind` and `blind-key.txt`:

```
node /Users/thomash/bench-runs/unit-route/scripts/blind-prep.mjs
```

Sleep state: `pmset -g log`, window 11:41:35-12:48:20 local time (+0200).
