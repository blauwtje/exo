Guard not landed: in this benchmark, subagents in the old version (without the guard) ran the whole suite a median of 0 times and at most once (the one time: `exo:review-branch-deep` in 01-old), so there was nothing to save. Faster: no, the median wall-clock time was +2.8%. Cheaper: no, the median cost was -2.7%, both within the spread of n=3. And the refusal in 04-new discarded a test file that was written in the same Bash call.

# Benchmark suite-guard: exo v0.76.0 (cac9a84e) against the branch subagent-suite-guard (115f1af5), 2026-10-03

This report compares v0.76.0 (`old`, `.worktrees/bench-old`) with the branch tip 115f1af5 (`new`, `.worktrees/bench-new`) on the same task. Each run starts with a warm-up `npm test` in the main session, then runs `/exo:build` on `docs/plans/business-invoices.md` and ends with `exo:verify`, on the TypeScript fixture with five plan tasks and the new plan (`--plan new`). Each version ran three times, alternating from 01-old through 06-new. The run directories are in `/Users/thomash/bench-runs/suite-guard-2/`.

Every number names its source. `metrics.json` is in `/Users/thomash/bench-runs/suite-guard-2/` (see "Reproduce"); `meta.json`, `stdout.json`, `suite-runs.jsonl` and `exo-settings.txt` are per run in `/Users/thomash/bench-runs/suite-guard-2/<run>/`, and `runtimes.json` per run in `/Users/thomash/bench-runs/suite-guard-2-heavy/<run>/`. The transcripts are under `~/.claude/projects/-Users-thomash-bench-runs-suite-guard-2-<run>-repo/`, and the sleep state comes from `pmset -g log` on this Mac.

Differences are computed from the medians as `(new - old) / old x 100`. Example for the wall-clock time: `(392.0 - 381.5) / 381.5 x 100 = +2.8%`.

An earlier measurement on 097ac6f5 (2026-10-02, `/Users/thomash/bench-runs/suite-guard/`) measured a build whose guard never learned a duration: the warm-up `time npm test` did not count as a full suite there, so the guard let everything through and refused zero times. Commit 115f1af5 did record the duration of such a wrapped suite run. This repeat replaces that measurement.

## Main table per version

Median with range (min-max) over n=3 runs per version.

| Measure | Old: median (min-max) | New: median (min-max) | Median difference | Source |
|---|---|---|---|---|
| Wall clock total (s) | 381.5 (324.2-1320.9) | 392.0 (319.6-676.7) | +2.8% | meta.json `wallMs` |
| Cost total (USD) | 1.3627 (1.2315-1.5955) | 1.3262 (1.2762-1.5318) | -2.7% | stdout.json `total_cost_usd` |
| Tokens total (M) | 1.82 (1.57-2.14) | 1.84 (1.61-2.11) | +1.0% | metrics `totalTokens` |
| Full suite runs in the log, incl. warm-up | 3 (2-4) | 2 (2-3) | -33% | suite-runs.jsonl, lines with `full:true` (equal to metrics `fullSuiteRunsLog`) |
| Full suite runs outside the warm-up | 2 (1-3) | 1 (1-2) | -50% | same minus 1; the warm-up is the first `full:true` line, from the main session |
| Full suite runs by subagents (executed) | 0 (0-1) | 0 (0-0) | n/a | transcripts, see "Full suite runs per agent type"; the one is the reviewer of 01-old |
| Guard refusals | 0 (0-0) | 1 (0-1) | n/a | metrics `suiteGuardRefusals` |

With n=3 the medians are sensitive to the two runs that the Mac's sleep state stretched, 01-old and 02-new (see "Sleep during the measurement"). Without those two, the wall-clock times are close together: old 324.2 and 381.5 s, new 319.6 and 392.0 s. The differences in wall clock, cost and tokens fall well within the spread of each version, so this measurement shows no gain in time or money.

## Per run

| Run | Version | Wall (s) | Cost USD | Tokens M | Suite runs log incl. (excl.) warm-up | Refusals | Warm-up suite duration (s) | `subagent_suite_after_seconds` |
|---|---|---|---|---|---|---|---|---|
| 01-old | v0.76.0 | 1320.9 | 1.5955 | 2.14 | 4 (3) | 0 | 32.5 | does not exist in v0.76.0 |
| 02-new | branch | 676.7 | 1.2762 | 1.61 | 2 (1) | 1 | 174.8 | 20 |
| 03-old | v0.76.0 | 324.2 | 1.2315 | 1.57 | 2 (1) | 0 | 32.6 | does not exist |
| 04-new | branch | 319.6 | 1.3262 | 1.84 | 2 (1) | 1 | 32.5 | 20 |
| 05-old | v0.76.0 | 381.5 | 1.3627 | 1.82 | 3 (2) | 0 | 32.3 | does not exist |
| 06-new | branch | 392.0 | 1.5318 | 2.11 | 3 (2) | 0 | 32.4 | 20 |

Sources: meta.json `wallMs`, stdout.json `total_cost_usd`, metrics `totalTokens`, suite-runs.jsonl and metrics `suiteGuardRefusals`. The suite duration is the last `duration_ms` in the tool result of the warm-up in the main transcript. The threshold comes from `exo-settings.txt`, line "Subagent test runs: Over twenty seconds (subagent_suite_after_seconds = 20, project)", which appears only in the new runs. All six runs ended with exit code 0 and without a timeout (`meta.json`, `/Users/thomash/bench-runs/suite-guard-2-progress.log`).

## Suite duration against the 20 s threshold

In five of the six runs the suite takes 32.3-32.6 s (`duration_ms` of the warm-up), well above the 20 s threshold that the branch shipped as its default. A subagent that started the whole suite therefore had to be refused. The 174.8 s of 02-new is not the suite itself but the sleep state: the warm-up ran from 08:15:36 to 08:18:32Z, in the middle of the sleep window (see "Sleep during the measurement"). `runtimes.json` of 02-new therefore recorded 175.409 s.

In all three new runs the guard knew the duration before the first subagent started. Source: `durations` in `runtimes.json`, compared with suite-runs.jsonl and the Agent calls in the main transcript.

| Run | `npm test` in runtimes.json | Recorded at | First build-task started | First task test (suite-runs.jsonl) |
|---|---|---|---|---|
| 02-new | 175.409 s | 08:18:32Z | 08:22:01Z | 08:22:39Z |
| 04-new | 33.159 s | 08:33:02Z | 08:33:24Z | 08:33:26Z |
| 06-new | 33.177 s | 08:44:44Z | 08:45:08Z | 08:45:10Z |

The `time` prefix of the warm-up, which blinded the guard in the earlier measurement, was no longer a problem on that branch: `wholeSuiteKeys("time npm test 2>&1 | tail -20")` gives `["npm test"]`.

## Full suite runs per agent type

A Node script scanned every Bash `tool_use` in the main transcript `<sessionId>.jsonl` and in every subagent transcript under `<sessionId>/subagents/agent-*.jsonl`; the agent type comes from the matching `*.meta.json` (`agentType`). A candidate was every `npm test`, `npm run test` or `node scripts/test.mjs` without a `tests/` or `.test.ts` argument in the same command segment, plus every tool result with `may not run the whole test suite`. Then every `full:true` line in suite-runs.jsonl was matched by timestamp to the Bash window (call to result) that started it. This also counts the verify gate, which starts the suite through `skills/verify/scripts/verify.mjs` and which a text scan alone would miss. A refused attempt is not in suite-runs.jsonl, because the hook stops the command before it runs.

| Run | Main session (warm-up + gate/regate) | exo:build-task | exo:fix-review | exo:review-branch / exo:review-branch-deep | Other |
|---|---|---|---|---|---|
| 01-old | 1 + 2 (gate 07:56:11, regate 08:14:14) | 0 | 0 | 1 (review-branch-deep, 07:57:55) | 0 |
| 02-new | 1 + 1 (gate 08:24:58) | 0 executed, 1 refused | not dispatched | 0 | 0 |
| 03-old | 1 + 1 (gate 08:30:05) | 0 | not dispatched | 0 | 0 |
| 04-new | 1 + 1 (gate 08:35:40) | 0 executed, 1 refused | not dispatched | 0 | 0 |
| 05-old | 1 + 2 (gate 08:40:52, regate 08:42:57) | 0 | 0 | 0 | 0 |
| 06-new | 1 + 2 (gate 08:47:03, regate 08:49:35) | 0 | 0 | 0 | 0 |

Summed per version, outside the warm-up: old 7 full suite runs, of which 6 by the main session (gate and regate) and 1 by the reviewer of 01-old; new 4, all by the main session. In all runs build chose the direct route with five `exo:build-task` subagents, without `exo:run-unit`. The reviewer was always `exo:review-branch-deep`, because task 1 carries `Risk: public signature`; `exo:review-branch` did not occur. All full suite runs ran in the main directory `repo`, none in a task directory `repo-task-N`.

The lower number of full suite runs in the new version comes mostly from the new runs needing a regate after a fix round less often, and from the reviewer of 01-old running the suite. It does not come from the guard: in the old runs no build-task ran the suite.

## Guard refusals

There are two refusals, recognizable in the transcripts by the text of `hooks/guards/suite-guard.mjs` (`may not run the whole test suite`). That count matches metrics `suiteGuardRefusals` (02-new 1, 04-new 1, 06-new 0). Both came from the `exo:build-task` of task 5, which appended the whole suite after its own test.

1. 02-new, `exo:build-task` "Build Task 5 shipping split" (`agent-afd6ed821504c0457`), 08:24:28Z. The refused command was one Bash call with a python3 heredoc that edited `src/order.ts` and `src/invoice.ts`, a `cat > tests/invoice-shipping.test.ts` heredoc, and then `npm test -- tests/invoice-shipping.test.ts 2>&1 | tail -30; npm test 2>&1 | tail -8; npm run typecheck 2>&1 | tail`. The message said "its last run in this project took 175 s, over subagent_suite_after_seconds (20 s)". The subagent then ran `git status --short` (empty), wrote "Nothing ran. I'll rerun the same edits without the full suite." and at 08:24:38 made the same edits with only `npm test -- tests/invoice-shipping.test.ts`, which passed. At 08:24:44 it reported "Task 5: GREEN", 16 s after the refusal, without a new attempt at the suite.
2. 04-new, `exo:build-task` "Build Task 5 shipping" (`agent-a9e283b50871f98c2`), 08:35:12Z. The refused command was a `cat > tests/invoice-shipping.test.ts` heredoc, followed by `npm test -- tests/invoice-shipping.test.ts 2>&1 | tail -25; npm test 2>&1 | tail -12`. The message said "its last run in this project took 33 s, over subagent_suite_after_seconds (20 s)". The subagent then ran `ls tests/invoice-shipping.test.ts; npm test -- tests/invoice-shipping.test.ts` and saw that the file did not exist. It wrote "The hook blocked the whole command, so the file was never written. I'll write it again.", wrote the file again with Write and ran `npm test -- tests/invoice-shipping.test.ts`, which passed. At 08:35:26 it reported "Task 5: GREEN", 14 s after the refusal.

The guard refused the whole Bash call, including the file edits that come before it in the same command. In 04-new the test file was therefore never written, and in 02-new the edits to `src/order.ts` and `src/invoice.ts` were not made either. Both subagents noticed this themselves and redid the edit. No subagent got stuck on a refusal, there was no retry loop, and all subagent transcripts end with a final report.

## Sleep during the measurement

Two runs were stretched by the Mac's sleep state, not by exo. According to `pmset -g log` the display turned off at 09:59:13 local time ("Display is turned off") and the Mac went into `Idle Sleep` at 09:59:18 local (07:59:18Z). Until the full `Wake` at 10:24:03 local (08:24:03Z) it alternated between `Maintenance Sleep` and short `DarkWake`s of 10 to 20 s. Whether a `caffeinate` was running then was not checked; the sleep itself is established in the log.

- 01-old took 1320.9 s, of which 905.6 s was the fix phase (metrics `phases.fix`). `exo:fix-review` (`agent-af54f61fe6034c208`) started two targeted tests of about 50 ms each at 07:59:19Z, one second after the sleep began. The result only came back at the DarkWake at 08:09:13Z, with the message that the command "did not complete within its 120s timeout and was moved to the background". At 08:09:30Z the Mac slept again until 08:13:48Z, and after that fix-review finished in 7 s ("fixed=2 reported=2"). About 14.5 min of the fix phase is sleep.
- 02-new had a build phase of 555.6 s (metrics `phases.build`, warm-up included) against 2.8-3.1 min in the other runs. Two stretches fall in the sleep window: the warm-up of 175 s (normally 33 s) and a gap from 08:18:41 to 08:21:54Z between two consecutive Bash calls, which coincides with `Maintenance Sleep` from 10:18:40 to the DarkWake at 10:21:51 local. About 335 s of the 676.7 s wall clock is therefore sleep.

Both runs are therefore the maxima of their version, which increases the spread of the wall clock. The guard's decision in 02-new did not depend on the inflated 175 s: with the normal 33 s it would also have refused, as 04-new shows; only the text of the message differed. Run a next measurement under `caffeinate -i`, so the Mac does not enter `Idle Sleep` during the series, and afterwards check `pmset -g log` for sleep within the measurement window.

## Findings besides the guard

On the branch, `wholeSuiteKeys` in `lib/runtime-log.mjs` also saw `ls tests` and `npm run lint` as a full suite. `runtimes.json` of 02-new contains `ls tests` (0.021 s) and `npm lint` (6.389 s) besides `npm test`, and 04-new and 06-new also contain `ls tests`. Checked on the branch:

```
"ls tests"                       -> ["ls tests"]
"npm run lint"                   -> ["npm lint"]
"time npm test 2>&1 | tail -20"  -> ["npm test"]
"npm test -- tests/tax.test.ts"  -> []
```

The cause is `TEST_LIKE = /test|e2e|\bcheck(?!out)|lint|verify/` (`lib/runtime-log.mjs:29`), which matches the bare word `tests` and `lint`. In this measurement that had no consequence, because both durations were under 20 s. With a lint of more than 20 s, the guard would have refused a subagent running lint, with a message about the whole test suite.

`metrics.json` reports `fullSuite.warmUp: 0` in all six runs, although every run has a warm-up (`time npm test 2>&1 | tail -N`, the first `full:true` line in suite-runs.jsonl). The warm-up was therefore subtracted from the log by hand in the "outside the warm-up" lines above. Why `benchmarks/lean-gates-metrics.mjs` misses the warm-up was not investigated.

## Reproduce

Per run, through `/Users/thomash/bench-runs/run-all-2.sh` from `.worktrees/subagent-suite-guard`, first runs 1-2 and then 3-6 back to back:

```
EXO_HEAVY_CACHE=/Users/thomash/bench-runs/suite-guard-2-heavy/<NN-arm> node benchmarks/lean-gates.mjs --version <old|new> --plan new --run <n> --out /Users/thomash/bench-runs/suite-guard-2 --timeout-min 30
```

The bench worktrees:

```
git worktree add --detach .worktrees/bench-old cac9a84e
git worktree add --detach .worktrees/bench-new 115f1af5
```

The metrics, which write `/Users/thomash/bench-runs/suite-guard-2/metrics.json`:

```
node benchmarks/lean-gates-metrics.mjs /Users/thomash/bench-runs/suite-guard-2 --no-recheck
```

Model `claude-opus-5-5`, effort `medium`, budget 30 USD per run (`meta.json` `argv`). Sleep state: `pmset -g log`, window 09:59-10:24 local time (+0200).
