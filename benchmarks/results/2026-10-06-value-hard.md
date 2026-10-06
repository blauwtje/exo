# exo value benchmark: hard tasks, phase 2

Measured on the two tasks left after piloting 13 value tasks against the baseline alone: `value-test-pollution` and `value-context-guards`. Arms `baseline` and `exo`, Sonnet 5 (`claude-sonnet-5`) at the CLI's default effort, 5 runs per task and arm, concurrency 2, 20 cells. exo loaded from `59b5c79b`. Claude Code 2.1.291. The session hook handed exo's rules to all 10 exo cells and to none of the 10 baseline cells (`exoLoaded`). No cell timed out and none is missing.

```bash
node benchmarks/run.mjs --tasks value-test-pollution,value-context-guards --arms baseline,exo --model sonnet --runs 5 --concurrency 2 --out benchmarks/runs/2026-10-06-value-phase2
```

A cell passes when the task's hidden `check.mjs` finds no defect. `Tokens` is weighted input plus output from the cell's `usage.json`, weighted as `score.mjs` weights them. `Cost` is `total_cost_usd`. `Wall` is `wallMs` from `checks.json`. Tokens and wall are mean ± sample standard deviation over 5 runs. Cost is the mean per cell, because the scorer printed no standard deviation for it.

The decision rule was fixed before the run. On a task, exo counts as better only if its pass rate beats the baseline's by more than 2 standard errors of the difference. With the baseline at 0/5, exo needs at least 3/5.

## How the two tasks were chosen

Thirteen value tasks were built, each a trap where one exo claim should matter. Only the baseline arm ran in the pilots, so no exo result shaped the choice.

- **Round 1.** Eight tasks, one per claim: `value-commit-hygiene`, `value-refactor-no-shim`, `value-lean-minimal-diff`, `value-find-cause-decoy`, `value-destructive-safe`, `value-proof-e2e`, `value-fresh-eyes-review` and `value-context-guards`. Each check fails on its seed and passes on its reference solution. The pilot ran the baseline twice per task, 16 cells, $2.93. Six tasks went 2/2 because the seeds are 5 to 20 files that the session reads whole, and the prompt or seed leaks the cause. `value-destructive-safe` went 0/2 for the wrong reason. Neither run touched the data, both proved the fix with `STOCKROOM_DB` on the command line, then ended on a question and left `npm test` red, so it measured decisiveness and not harm. `value-context-guards` went 1/2, and its miss fixed two of three faults and never touched the fx lookback.
- **Round 2.** Five more tasks, built from one design file: `value-test-pollution`, `value-export-mismatch`, `value-add-field-migration`, `value-rename-propagation` and `value-destructive-reset`. The keep rule was that the baseline fails at least 2 of 5 for the task's own reason. The pilot ran the baseline 5 times per task, 25 cells, $7.45. Four tasks went 5/5. `value-test-pollution` went 0/5, every run fixing only the visible leak.
- **Kept.** The plan's closing list holds `value-context-guards` and `value-test-pollution`. It gives no line of its own for dropping `value-destructive-safe`, so the caveat above is the only recorded reason.
- **Lesson the plan records.** Sonnet 5 alone handles multi-place features, multi-fault reports with a dashboard to compare against, and data-safety traps. What bit was a visible symptom with latent sibling faults of the same class and no cheap way to observe them.

The user approved phase 2 at the projected $10.06.

## Per task

| Task | Pass, baseline | Pass, exo | Verdict | Tokens, baseline | Tokens, exo | Cost per cell, baseline | Cost per cell, exo | Wall, baseline | Wall, exo |
|---|---|---|---|---|---|---|---|---|---|
| value-test-pollution | 0/5 | 0/5 | not better (diff 0.00, 2SE 0.00) | 62.7k ± 15.2k | 66.7k ± 6.5k | $0.164 | $0.171 | 31s ± 9s | 29s ± 4s |
| value-context-guards | 4/5 | 2/5 | not better (diff -0.40, 2SE 0.57) | 99.7k ± 16.1k | 165.2k ± 34.1k | $0.289 | $0.449 | 61s ± 14s | 88s ± 21s |

Spend by arm: baseline $2.26 ($0.82 plus $1.44), exo $3.10 ($0.85 plus $2.25). The scorer's total for the run is $5.37, a cent above the sum of the printed figures. The run came in under the $10.06 projection.

## Failed exo runs

Eight of ten exo cells failed. Every failure is a real miss and not a check artifact, according to the transcript analysis.

`value-context-guards`, 3 of 8 defects in each failed cell. The check names the gap test (a rate gap longer than a weekend must use the latest earlier rate), the March 2026 total (123484369, want 121903319) and the March per-merchant totals (9 of 60 merchants differ). Each run fixed `src/amount.mjs` (thousands separators and accounting parentheses) and left `MAX_LOOKBACK_DAYS = 2` in `src/fx.mjs`.

- exo #2. Ran `npm run report 2>&1 | tail -40`, so the 5,000-line stderr log showed no warnings. Never grepped `WARN` and read `fx.mjs` only in a bulk `cat`.
- exo #4. Ran `grep -v 'row ' /tmp/report.err | head -40`, which showed 39 weekend-fallback lines and cut off the "within 2 days ... using 1" lines. Its +98,089.29 decomposition matched the parser defects exactly, but the fx effect (-15.8k) was never in the delta it explained.
- exo #5. Wrote the repro to `.exo/debug/debug-repro.log` as find-cause step 1 asks, read only `tail -n 40` of it, and fixed only the parser.

`value-test-pollution`, 10 of 15 defects in each failed cell. Orders `reversed`, `pricing first`, pricing then credit notes, rotated by 3 and 6, and shuffled all fail, plus four leak tests ("half a cent rounds up", "a quarter share rounds to the nearest cent", "a tenant without an override pays the base price"). Each run fixed `Object.assign(DEFAULTS, overrides)` in `src/config/options.mjs` (+1/-1, no tests touched). None changed the module-level `Map` keyed by sku in `src/catalog/price-list.mjs` or the module-level `let activeMode` in `src/pricing/rounding.mjs`.

- exo #1. No Skill call. Reported that five shuffled orders and the reversed order passed.
- exo #2. No Skill call. Brushed the two other modules without acting on them.
- exo #3. Invoked `exo:find-cause`. Reported the reversed order passing.
- exo #4. Invoked `find-cause`. Reported the reversed order passing.
- exo #5. Invoked `exo:find-cause`. Reported 25 shuffles and the reversed order passing.

## Findings

- **No advantage.** exo does not beat the baseline on either task by the rule. On `value-test-pollution` both arms went 0/5. On `value-context-guards` the baseline went 4/5 and exo 2/5. That gap is not distinguishable from noise at n=5 (Fisher exact two-sided p about 0.52 in the analysis), but it points the wrong way.
- **Skills that fired.** In all 5 `value-context-guards` exo cells the first call was `Skill exo:find-cause`. No cell dispatched `exo:solve-hard`, `exo:locate-code` or a fixer, so steps b and c of find-cause (dispatch an investigator, dispatch a fixer) never ran. Cells #2 to #5 then ran `size-facts.mjs`, `pick-reviewer.mjs` and `Skill code-review`, which ran as a forked general-purpose subagent. Cell #1 ran no review. In `value-test-pollution`, 3 of 5 exo cells invoked find-cause (#3, #4, #5) and 2 made no Skill call (#1, #2), although rule 1 routes an unproven failure to find-cause. `build` fired in no cell of either task.
- **The find-cause gap.** The analysis says find-cause stops at the first proven cause, and nothing in its steps asks whether that cause explains the whole gap. In `value-context-guards` the parser fix explained 98k of a gap that included -15.8k of fx effect. The analysis proposes a rule to quantify the cause against the symptom and chase the residual, and for test pollution a step to grep for module-level mutable state next to a proven leak.
- **What separated pass from fail on `value-context-guards`.** The two exo passes (#1, #3) looked at the report's `WARN` lines by type and count within their first five tool calls, saw the "using 1" fallback, checked it against the README rule and fixed `fx.mjs`. The three exo failures never read the warnings (#2, #5) or read a truncated slice (#4). Baseline failure #5 is the same pattern: 11 turns, one `npm run report | tail -30`, no look at fx or NOK.
- **The review step.** The `code-review` fork reviews the diff, and the fx gap was not in the diff, so it polished the parser's edge cases (European `1,5`, `(-12.50)`, leading-dot amounts) and did not widen the search.
- **Vacuous order sweeps.** The check forces each order through generated wrapper modules that each `import` one test file. The exo sessions passed the files as arguments to `node --test --test-isolation=none` and reported passing sweeps. The analysis infers, and did not test, that argument order is not honored in that mode, so the sweeps never varied the order. The round 2 pilot table states this as fact for the baseline runs ("Node sorts `node --test` file arguments").
- **Tokens, cost and wall time.** On `value-context-guards` exo used 165.2k tokens against 99.7k, about 65k more (+66%), and $0.449 against $0.289 per cell. Computed here from the printed standard deviations, the token gap exceeds its 2 standard errors (33.7k) and the wall-time gap of 27s just exceeds its 22.6s. The analysis splits the token gap as about +33k from cache reads (16 to 26 assistant messages per exo cell against 11 to 14), +17k from cache writes, +11.5k from the forked review, and +3.7k from output. The skill text (about 0.9k tokens) and the hook context (about 0.75k tokens) are small by comparison. On `value-test-pollution` the token difference (+4.0k) and the wall-time difference (-2s) are inside their 2 standard errors (14.8k and 8.8s by the same arithmetic), and no review fork ran.
- **Other exo pieces.** The read guard blocked one command in `value-context-guards` exo #1 (a grep on a 217 KB CSV), and the session reran a narrower one. Test-first (failing tests before the fix) appeared in exo #3, #4 and #5 and did not change the diagnosis. The analysis saw no behavior from "check a claim by running" that the baseline cells lacked.

## Limitations

- n=5 per task and arm. A 0/5 against 0/5 cannot show a difference. With the baseline at 4/5, exo cannot beat it by this rule even at 5/5 (difference 0.20, 2SE 0.36, computed here).
- The transcript analysis is by a Sonnet delegate reading the session transcripts, `checks.json`, `usage.json` and the task sources. It did not recompute the scorer's numbers.
- Raw cells sit in `benchmarks/runs/2026-10-06-value-phase2/`, which is git-ignored.
