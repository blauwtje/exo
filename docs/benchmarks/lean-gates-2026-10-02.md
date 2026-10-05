Is new faster and cheaper without losing quality? No: new is faster (median wall-clock time -32.1%), but not cheaper (median total_cost_usd -0.7%, mean +4.2%; median tokens +3.6%), and quality is equal (all final checks pass on HEAD, median blind score 22 new against 20 old, +10.0%).

# Benchmark lean-gates: exo old (d33adf37) against new (a8b27a45), 2026-10-02

This report compares two versions of exo on the same task: `/exo:build` followed by `exo:verify` on a TypeScript fixture with five plan tasks. Each version ran three times. Every number below names its source. All source files are in `.git/exo/bench-lean-gates/` of the main checkout, unless an absolute path is given. The run directories are in `/Users/thomash/bench-runs/lean-gates-2026-10-02/`.

Percentage differences are always computed from the medians (or, where stated, the means) as `(new - old) / old x 100`. Example for the wall-clock time: `(434040 - 639223) / 639223 x 100 = -32.1%`.

## Main table per version

Median with range (min-max) over n=3 runs per version. Times in seconds, derived from the milliseconds in the source.

| Measure | Old: median (min-max) | New: median (min-max) | Median difference | Source |
|---|---|---|---|---|
| Wall clock total | 639.2 (561.9-723.3) | 434.0 (401.8-603.6) | -32.1% | meta.json `wallMs` |
| Build phase | 355.2 (294.3-437.9) | 195.7 (163.3-259.3) | -44.9% | metrics.json `phases.build` (transcript-ts) |
| Verify gate | 48.0 (47.1-53.0) | 44.7 (44.1-45.3) | -6.8% | metrics.json `phases.gate` (transcript-ts) |
| Review | 90.4 (63.5-118.3) | 92.5 (54.6-94.3) | +2.3% | metrics.json `phases.review` (transcript-ts) |
| Fix round | 94.0 (70.3-142.8) | 66.0 (61.5-173.6) | -29.8% | metrics.json `phases.fixRound` (commit-ts) |
| Full suite runs (log) | 11 (9-12) | 5 (4-8) | -54.5% | metrics.json `fullSuite.log.full` (suite-runs.jsonl) |
| Full suite runs (Bash of agents) | 6 (4-6) | 3 (2-5) | -50.0% | metrics.json `fullSuite.bash.full` |
| Tokens total | 1,824,427 (1,822,093-2,001,059) | 1,889,241 (1,843,971-2,575,166) | +3.6% | metrics.json `tokens.total.totalTokens` |
| Tokens main session | 1,261,252 (1,130,537-1,383,657) | 1,399,003 (1,240,763-1,980,774) | +10.9% | metrics.json `tokens.main.totalTokens` |
| Tokens subagents | 617,402 (563,175-691,556) | 594,392 (490,238-603,208) | -3.7% | total minus main session |
| Cost total (USD) | 1.4135 (1.4089-1.5042) | 1.4033 (1.3840-1.7204) | -0.7% (mean +4.2%) | stdout.json `total_cost_usd` |
| Cost main session (USD) | 0.7719 (0.7067-0.8065) | 0.8460 (0.7532-1.0701) | +9.6% | cost-recon.md, corrected rates |
| Cost subagents (USD) | 0.6960 (0.6358-0.7068) | 0.6308 (0.5562-0.6503) | -9.4% | cost-recon.md, corrected rates |
| Review findings | 1 (1-2) | 2 (2-4) | +100% | metrics.json `quality.review` (branch-review.md) |
| Of which defects | 0 (0-0) | 1 (1-1) | n/a | same, `Count:` line |
| Blind score (max 25) | 20 (20-24) | 22 (20-23) | +10.0% | /tmp/lg-blind/judgement.md + blind-key.txt |
| Final check passed (test/typecheck/lint) | 3 of 3 | 2 of 3 at the recheck, 3 of 3 on HEAD | n/a | metrics.json `quality.recheck`, lint-04.md |

The mean costs are $1.4422 old against $1.5026 new (metrics.json `aggregate.*.costHarnessUsd`). The mean is higher for new because of 02-new ($1.7204), the run with the false FAIL (see below). The token difference of +3.6% is computed from the exact medians; the rounded table in metrics-table.md (1.89 against 1.82 M) would suggest +3.8%.

On the cost source: metrics-table.md also shows a "$ transcript" column ($2.01 old, $2.04 new as median). That column overstates the cost, because `benchmarks/prices.mjs` has no row for `claude-opus-5-5` and therefore prices the model as `claude-opus-5` ($5/$25 instead of $4/$20 per million, cost-recon.md; the row was added after this run). This report therefore uses `total_cost_usd` from stdout.json, which already includes the subagents and matches the transcript tokens at the correct rates to within $0.002. The split between main session and subagents comes from those corrected transcript prices (cost-recon.md).

## Per run

Source per column as in the main table. Reviewer: `REVIEWER:` line from metrics.json `reviewer.line`, expected by the version's own rule from `reviewer.expectedByOwnRule`.

| Run | Wall (s) | Build (s) | Gate (s) | Review (s) | Fix round (s) | Suite log/Bash | Tokens (main/sub) | Cost USD (main/sub) | Reviewer chosen/expected | Findings (defect/hazard) | Blind | Recheck t/tc/l |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 01-old | 723.3 | 437.9 | 53.0 | 118.3 | 70.3 | 12/6 | 1,822,093 (1,130,537/691,556) | 1.4135 (0.7067/0.7068) | deep/deep | 1 (0/1) | F: 24 | P/P/P |
| 02-new | 603.6 | 259.3 | 44.7 | 94.3 | 173.6 | 8/5 | 2,575,166 (1,980,774/594,392) | 1.7204 (1.0701/0.6503) | deep/deep | 4 (1/3) | D: 20 | P/P/P |
| 03-old | 561.9 | 294.3 | 47.1 | 90.4 | 94.0 | 9/4 | 2,001,059 (1,383,657/617,402) | 1.5042 (0.8065/0.6960) | deep/deep | 2 (0/2) | E: 20 | P/P/P |
| 04-new | 434.0 | 195.7 | 44.1 | 92.5 | 61.5 | 5/3 | 1,843,971 (1,240,763/603,208) | 1.3840 (0.7532/0.6308) | deep/deep | 2 (1/1) | B: 23 | P/P/F |
| 05-old | 639.2 | 355.2 | 48.0 | 63.5 | 142.8 | 11/6 | 1,824,427 (1,261,252/563,175) | 1.4089 (0.7719/0.6358) | deep/deep | 1 (0/1) | C: 20 | P/P/P |
| 06-new | 401.8 | 163.3 | 45.3 | 54.6 | 66.0 | 4/2 | 1,889,241 (1,399,003/490,238) | 1.4033 (0.8460/0.5562) | deep/deep | 2 (1/1) | A: 22 | P/P/P |

"deep" stands for `review-branch-deep`. All six runs ended with exit code 0, landed tasks 1-5 and had exactly one fix round (meta.json, metrics.json `quality`).

## Build time per task

Seconds between consecutive `Plan-task:` commits; the first task counts from the start of the run (metrics.json `phases.buildPerTask`, source commit-ts, resolution 1 s). Tasks 1-3 run in parallel in a wave, so these deltas are landing gaps, not build time. The actual build time per subagent is in metrics.json `phases.buildTaskAgents`.

| Run | T1 | T2 | T3 | T4 | T5 |
|---|---|---|---|---|---|
| 01-old | 192.2 | 33 | 33 | 78 | 99 |
| 03-old | 99.9 | 33 | 32 | 60 | 68 |
| 05-old | 159.6 | 0 | 0 | 93 | 100 |
| 02-new | 87.7 | 1 | 1 | 57 | 110 |
| 04-new | 60.5 | 1 | 1 | 28 | 103 |
| 06-new | 59.7 | 1 | 0 | 69 | 31 |

In 01-old and 03-old there are gaps of 32-33 s between the landings of T1, T2 and T3. That is the duration of one full `npm test` (the suite takes about 33 s, build.md), the old land gate that runs per task (suite-analysis.md). In new, those tasks land within 1 s of each other, because the land gate is `npm run typecheck`. 05-old shows no gaps at T2 and T3, and the sources do not explain why; metrics.json does record 5 land-task calls for that run.

## Reviewer choice

Every run printed `REVIEWER: review-branch-deep` and also dispatched it (metrics.json `reviewer`). Both versions therefore chose the deep review six times out of six, and each time that matched their own rule (`fitsRule: true`):

- Old chooses deep for more than 5 files or more than 200 changed lines. The diffs had 10 files and 272-293 lines (metrics.json `reviewer.risk.files`, `changedLines`).
- New chooses deep because task 1 carries `Risk: public signature` (`riskTasks` in metrics.json, PLANS.md). The export signatures of `taxRate` and `computeTax` also changed, which would trigger the rule independently.

On this fixture the risk-based choice therefore gained nothing: the old diff rule gave the same result. No saving in review time is visible here; the median review was even 2.3% longer for new.

## Full suite runs

suite-analysis.md assigns every full suite run to a cause, but only for 01-old and 02-new. For the other runs only the counts are known (metrics.json).

| Run | Full (log) | Required by the rules | Extra | Extra by whom |
|---|---|---|---|---|
| 01-old | 12 | 6 (5 land gates, 1 verify gate) | 6 | build-task 4, main session 1, reviewer 1 |
| 02-new | 8 | 3 (verify gates) | 5 | build-task 3, reviewer 1, fix-review 1 |

- Old requires 5 land gates with `npm test` per run, plus the verify gate. New requires only the verify gate per verify round, because the land gate is `npm run typecheck`.
- In 02-new the third verify gate was only needed because of a false `FAIL Task 1` (see Quality). Without that FAIL, 02-new would have logged 7 full runs, of which 2 were required (fail-task1.md).
- In both versions, build-task agents ran `npm test` themselves, against the rule in `agents/build-task.md:30` ("Run only the brief's `Proof:` or `Run:`, never the plan's `Land gate:`"). The deep reviewer also ran the suite in both versions, and in new so did the fixer, although no rule asks for it.
- In 01-old the main session ran `npm test` by hand right after verify.mjs reported `SKIP success-criterion`.
- Runs started by agents: old 6 of 12, new 5 of 8. The gain therefore comes from the gates, not from agent behavior.

## Quality

**Final check.** The recheck runs `npm test`, `npm run typecheck` and `npm run lint` on the final HEAD (metrics.json `quality.recheck`). Five runs pass all three. 04-new fails lint with one error in `repo/.exo/probe.ts`, an untracked scratch file that the main session wrote after verify and after the fix commit to give the Stop hook a product proof (lint-04.md). A clone at HEAD 29a32f6 lints clean, so all commits are lint-clean and this is not a regression of the gates. Old would also have missed it: old does not lint anywhere. It does show that new never lints the fix-review commit, because `land-task --fix` and verify both run no lint. The blind judge saw all six trees pass typecheck, lint and test (judgement.md).

**False FAIL in 02-new.** The second verify round reported `FAIL Task 1`, although the test never ran: the process died within about 0.1 s, before the test wrapper wrote a log line. The same tree then passed by hand, in the third verify round and in 8 reproduction attempts (fail-task1.md). This cost 77 s of the 603.6 s wall clock and about $0.3. The cause lies in code that old and new share; verify.mjs discards the output, exit code and signal on a proof FAIL.

**Review findings.** From `repo/.exo/branch-review.md` per run:

- Old found no defects, only hazards: in 01-old that `buildInvoice` now throws on an order without lines; in 03-old that shipping costs silently disappear on an empty order and that `renderInvoice` shows no shipping line; in 05-old only that missing shipping line. All hazards were fixed.
- New found exactly one defect in every run, and always the same one: the implementation report of task 1 shows only a passing proof run and no failing run before it, which the rule for a `Risk:` task requires. That is a process finding, not a code error, and it can only arise in new because only the new plan has `Risk:` on task 1. It was handled as "report" each time, not fixed.
- In addition, new found the same kind of hazards as old: the throwing empty order (04-new, 06-new), and in 02-new the disappearing shipping costs, the missing shipping line and an unexplained `as RatePeriod` cast. All fixed.

The higher number of findings for new (median 2 against 1) therefore comes mostly from that Risk process rule, not from worse code.

**Blind judgement.** The judge saw only diffs, trees and the spec under `/tmp/lg-blind`, without plan headers or exo traces, and scored five criteria from 1 to 5 (judgement.md). Unblinded with blind-key.txt:

| Rank | Tree | Run | Score |
|---|---|---|---|
| 1 | F | 01-old | 24 |
| 2 | B | 04-new | 23 |
| 3 | A | 06-new | 22 |
| 4 (shared) | C | 05-old | 20 |
| 4 (shared) | E | 03-old | 20 |
| 6 | D | 02-new | 20 |

Median new 22, old 20; mean 21.67 against 21.33 (+1.6%). The best tree is an old run. According to the judge the differences are small and turn on test strength, scope discipline and edge cases outside the spec; all six meet every acceptance criterion.

## Setup

- Versions: old `d33adf3769ca18068557defb79b305fcf932eb27`, new `a8b27a456cf4430109a10f7c7ff8bc3f38a8f29c`, each as a separate worktree without changes (`pluginDirty: false`, meta.json).
- Claude Code `2.1.287`, Node `v24.16.0` (meta.json).
- Main session: model `claude-opus-5-5`, effort `medium` (meta.json). Subagents use the model from their frontmatter: `claude-sonnet-5-5` for build-task and fix-review, `claude-opus-5-5` for review-branch-deep, and in 03-old one general-purpose agent on `claude-opus-5-5` (metrics.json `tokens.byAgentType`, cost-recon.md).
- Invocation: `claude -p <prompt> --plugin-dir <worktree> --model --effort --permission-mode bypassPermissions --output-format json --setting-sources project,local --strict-mcp-config --max-budget-usd <b> --session-id <uuid>` (build.md). The prompt is the same for both versions.
- Isolation: the harness removes `CLAUDECODE`, `CLAUDE_EFFORT` and all `CLAUDE_CODE_*` from the environment and sets `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` and `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` (meta.json `env`). Output directories are outside every repo and every directory with a CLAUDE.md. A probe with haiku per version found 0 loaded CLAUDE.md instructions and a loaded exo (build.md).
- Project settings in the fixture: specs docs, replies tight, budget medium, ship local, workspace branch, guards on (exo-settings.txt).
- Fixture: TypeScript package `invoice-calc` with scripts `test`, `typecheck` and `lint`. The tests use a simulated ledger with 40 ms per round trip and 130 cases per file, so the full suite takes about 33 s and one test file about 6 s (build.md).
- Plans: the same goal, the same five tasks and the same success criterion (`npm test` passes). Only three lines differ, each the default that the version's own spec skill writes (PLANS.md): `Land gate: npm test` (old) against `Land gate: npm run typecheck` (new), `Lint: npx eslint` (new only), and `Risk: public signature` on task 1 (new only).
- Order alternating: 01-old, 02-new, 03-old, 04-new, 05-old, 06-new, back to back on 2026-10-02 from 12:19:39Z to 13:16:17Z (meta.json `startedAt`/`endedAt`).

## What can make the comparison unfair

- **n=3 per version.** The spread is large (wall clock new 401.8-603.6 s), so one outlying run shifts a mean strongly.
- **Warm prompt cache.** The runs followed each other directly. The main session writes only the 1-hour cache (cost-recon.md), so later runs can benefit from earlier ones; 01-old started cold. Each version does have an early and a late run.
- **API latency and network** vary from moment to moment and were not measured.
- **False FAIL in 02-new** (77 s, about $0.3, one extra suite run) affects only new, although the cause is in shared code.
- **Scratch file in 04-new** makes the recheck lint fail without the code being wrong.
- **The plans differ on purpose**, including in `Risk:`. The benchmark therefore also measures the Risk rule, which produced a process defect in every new run.
- **Artificially slow tests.** The simulated ledger makes every full suite run take 33 s; that enlarges the gain from fewer suite runs compared with a project with fast tests.
- **Mixed subagent models** (sonnet for building and fixing, opus for reviewing) are the same per version, but the proportions differ per run.
- **Aborted first attempt.** The first 01-old leaked `~/.claude/CLAUDE.md` and the exo CLAUDE.md into the session and was stopped and excluded (progress.md, build.md). Kept in `/Users/thomash/bench-runs/aborted-01-old-claude-md-leak`.
- **Missing price row** in `prices.mjs` for `claude-opus-5-5`, which makes the "$ transcript" column too high; this report does not use that column (the row was added after this run).
- **Quirk of the test wrapper:** `node --test` with one missing file next to existing files exits with 0, while a single missing file on its own exits with 1 (progress.md, build.md).
- **One machine, one day.**

## Reproduce

The harness, fixture, plans and tests are uncommitted in the worktree `.worktrees/bench-lean-gates` (`benchmarks/lean-gates.mjs`, `benchmarks/lean-gates-metrics.mjs`, `benchmarks/lean-gates/`, `tests/benchmark-lean-gates*.test.mjs`). The worktrees `.worktrees/bench-old` and `.worktrees/bench-new` must be at d33adf37 and a8b27a45. From the bench-lean-gates worktree, one run per line, in this order:

```sh
OUT=/Users/thomash/bench-runs/lean-gates-2026-10-02
node benchmarks/lean-gates.mjs --version old --run 1 --out $OUT --model claude-opus-5-5 --effort medium
node benchmarks/lean-gates.mjs --version new --run 2 --out $OUT --model claude-opus-5-5 --effort medium
node benchmarks/lean-gates.mjs --version old --run 3 --out $OUT --model claude-opus-5-5 --effort medium
node benchmarks/lean-gates.mjs --version new --run 4 --out $OUT --model claude-opus-5-5 --effort medium
node benchmarks/lean-gates.mjs --version old --run 5 --out $OUT --model claude-opus-5-5 --effort medium
node benchmarks/lean-gates.mjs --version new --run 6 --out $OUT --model claude-opus-5-5 --effort medium
node benchmarks/lean-gates-metrics.mjs $OUT
```

The harness refuses an existing run directory, so for a new measurement choose an empty `--out` outside every repo. The metrics step writes `$OUT/metrics.json` and prints the table from metrics-table.md; `--no-recheck` skips the final check.
