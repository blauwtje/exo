# exo review benchmark: the branch reviewer at `high`

Measured whether the branch reviewer (`review-deep`) at `high` effort finds a seeded defect on each of five tasks and stays quiet on the matching reference branch. This closes GT12J.1. Each task has a seeded branch (the reference with one defect) and a control branch (the reference itself); a `fix` finding on a seeded branch that overlaps the seeded lines counts as a hit, and a `fix` finding on a control counts as a candidate false alarm that is then typed by hand.

Setup: `claude-opus-5-5` at `high`, Claude Code 2.1.302, Node v24.22.0, 5 tasks (safe-path, sql-user, auth-token, csv-sum, rate-limit) x seeded and control x 3 rounds, n=1 per cell. Raw cells sit under `benchmarks/runs/eng2-review-high-r{1,2,3}`, which is git-ignored. The three sweep reports are `2026-10-18-review-high-r1.md`, `-r2.md` and `-r3.md` in this folder, verbatim copies; all three wrote `2026-10-18-sweep.md`. This file is written by hand from them.

## Sets and commits

| Set | Run dirs | Plugin commit | Cells | Cost | Status |
|---|---|---|---|---|---|
| original, rounds 1-3 | `eng2-review-high-r{1,2,3}` | `da460c7c`, run from the main checkout | 30 | $1.65 + $1.55 + $1.71 = $4.91 | valid |
| fix1 | `eng2-csv-fix-r{1,2,3}` | `ea376d42`, tree dirty | 3 | $0.725 | invalid, stray CSVs |
| fix2 | `eng2-csv-fix2-r{1,2,3}` | `476ad823` | 3 | $0.642 | invalid, stray CSVs |
| fix3 | `eng2-csv-fix3-r{1,2,3}` | `e6097e2e`, from the `int/round3` worktree | 3 | $0.909 | valid, csv-sum control only |

Total spend $7.18 of the $10 cap. fix3 ran from the `int/round3` worktree, not from `main`. Both branches there touch only `benchmarks/` and `tests/`, so the reviewer prompt was `main`'s; the deviation is harmless.

fix1 and fix2 are invalid. The csv-sum control then held two stray files, `benign.csv` and `hostile.csv`, written by `check.mjs` proof runs into the fixture folder (untracked in fix1, committed in `476ad823` for fix2). `prepareReviewBranch` copied the whole `solution/` folder with `fs.cpSync`, so the review branch carried both and the reviewer rightly flagged them against the plan's "No file other than `sales.js` changes". All 6 findings in each set were these files, typed (i). The cause is in `.exo/` notes only; the fixes are `2d6cec3b` (files removed) and `92b8785a` (`prepareReviewBranch` copies only the task file).

## Results

Seeded cells: every one found its defect (`Defects found 1`). Control cells: findings are `fix` findings; cost is the cell's Cost column.

| Task | Round | Seeded hit | Seeded cost | Control `fix` findings | Control cost |
|---|---|---|---|---|---|
| safe-path | r1 | 1 | $0.241 | 0 | $0.146 |
| safe-path | r2 | 1 | $0.181 | 0 | $0.194 |
| safe-path | r3 | 1 | $0.148 | 0 | $0.139 |
| sql-user | r1 | 1 | $0.142 | 0 | $0.127 |
| sql-user | r2 | 1 | $0.124 | 1 | $0.154 |
| sql-user | r3 | 1 | $0.135 | 0 | $0.134 |
| auth-token | r1 | 1 | $0.129 | 0 | $0.153 |
| auth-token | r2 | 1 | $0.131 | 0 | $0.133 |
| auth-token | r3 | 1 | $0.196 | 0 | $0.208 |
| csv-sum | r1 | 1 | $0.174 | 2 | $0.235 |
| csv-sum | r2 | 1 | $0.163 | 1 | $0.197 |
| csv-sum | r3 | 1 | $0.168 | 2 | $0.219 |
| rate-limit | r1 | 1 | $0.133 | 0 | $0.168 |
| rate-limit | r2 | 1 | $0.131 | 0 | $0.144 |
| rate-limit | r3 | 1 | $0.179 | 0 | $0.183 |

fix3 reran only `review-csv-sum-control-high`, on the reference with decimals summed exactly and multi-line records read:

| Round | Defects found | False alarms | Tokens | Wall time | Cost | Detail |
|---|---|---|---|---|---|---|
| fix3 r1 | - | 0 | 52862 | 68s | $0.274 | verdict CLEAN, 0 fix findings |
| fix3 r2 | - | 1 | 61745 | 81s | $0.312 | verdict FINDINGS, 1 fix findings |
| fix3 r3 | - | 1 | 60682 | 90s | $0.323 | verdict FINDINGS, 1 fix findings |

The two findings, verbatim from `benchmarks/runs/eng2-csv-fix3-r{2,3}/review-csv-sum-control-high/branch-review.md`:

- r2: `sales.js:23-23; concern; broken row swallows valid rows; a `"` inside an unquoted field (e.g. `Bob 12" pizza,5`) opens a quoted section that spans lines until a later stray `"` before `,` or a newline, so whole valid rows in between merge into one record and drop silently: `name,amount\nBob 12" pizza,5\nAnn,7\nCid 6",3\n` returns 3, which loses Ann's valid 7; open a quote only at the start of a field, and treat a mid-field `"` as a literal character; fix`
- r3: `sales.js:23-23; defect; broken rows corrupt valid rows; an unquoted field's mid-field `"` (e.g. `pipe 12",5`) opens quoted mode, and a later stray quote before a delimiter closes it, so `item,amount\npipe 12",5\nok,6\nbolt 3",7\n` merges three lines into one record and returns 7, silently dropping the valid row `ok,6`; treat `"` as opening a quote only at the start of a field (field empty and previous char a delimiter or record start), else append it literally; fix`

## Typing of every control `fix` finding

Types: (i) fixture bug, the reference is really wrong; (ii) reviewer wrong, its probe passes; (iii) real or arguable but beyond the spec, a false alarm against the reviewer. Probes ran on copies of the reference; none passes on it, so no finding is type (ii). The settlements are the Result call's and the Round 3 final call's.

| Cell | Finding | Type | Basis |
|---|---|---|---|
| csv-sum r1 | `sales.js:3-27` quoted field holding a newline drops the row | (i) | The limit "A record must fit on one line" is only a code comment (`solution/sales.js:5`), not in the Goal the reviewer got; the reference returns 0 for a valid RFC-4180 record worth 5. |
| csv-sum r3 | `sales.js:3-5` quoted newline drops the row | (i) | Same; returns 3 where 8 is expected. Labelled `concern`, action `fix`. |
| csv-sum r1 | `sales.js:43` float sum, 0.1+0.2 | (i), ambiguous control | The Goal asks for a total from real-system exports; the reference prints 30.299999999999997 for 10.10 + 20.20. The finding came back in 3 of 3 rounds with the same remedy, so it follows the code, not reviewer noise. The typing file read it as (iii) because the spec states no precision; that reading is defensible, so the cell counts neither way. |
| csv-sum r2 | `sales.js:44-45` float sum, 10.10+20.20 | (i), ambiguous control | Same. The r2 probe has no assertion, so it exits 0 before any fix; that breaks `review-rules.md:25` ("exiting non-zero now") and is the first recorded failure for GT12J.2. |
| csv-sum r3 | `sales.js:43` float sum, 0.1+0.2 | (i), ambiguous control | Same. |
| sql-user r2 | `db.js:10-12` object or array username makes `.get()` throw | (iii) | The fixture's own rubric accepts a throw on hostile input as refusal (`safe/verdict.mjs` `attempt`). Labelled `concern`, action `fix`. Appeared in 1 of 3 rounds, which reads as reviewer variance. One false alarm against the reviewer. |
| fix1, 6 findings | `benign.csv`, `hostile.csv` x 3 rounds | (i) | Harness leak, see Sets and commits. Set invalid. |
| fix2, 6 findings | `benign.csv`, `hostile.csv` x 3 rounds | (i) | Same. Set invalid. |
| fix3 r2 | `sales.js:23` mid-field quote swallows valid rows | (i) | Traced through `parseRecord`: returns 3 where 15 is expected. Real defect of the reference as measured. |
| fix3 r3 | `sales.js:23` mid-field quote swallows valid rows | (i) | Returns 7 where 18 is expected. Real defect. |

Over all four sets, csv-sum control `fix` findings at `high` came to 19 (original 5, fix1 6, fix2 6, fix3 2); each fails against the branch as built, and none is type (ii). The float sum is the only one that was not a plain real defect. The float-sum and quoted-newline findings appeared in 3 of 3 original rounds and in no round after the first repair, so the findings followed the code.

## Counts

- **Seeded recall: 15/15.**
- **Control false alarms, the four tasks other than csv-sum: 1/12 (8%).** The one is sql-user r2, type (iii). The 95% upper bound for 1 of 12 is about 38%.
- **csv-sum control: unmeasured.** It is not a valid control at `high`: each rewrite of its reference has surfaced a new real parser defect. It is reported with every finding typed, not as 0/3.
- **Raw, untyped:** 4/15 control cells flagged in the original rounds (csv-sum r1, r2, r3; sql-user r2); 2/3 flagged in fix3. Pooled with the fix3 csv-sum cells in place of the original ones that is 3/15 (1 + 2), the middle band, below the 4/15 Fail row.
- **The sweep's own "Reviewer false alarms" line** counts any defect or concern finding per round and prints 20%, 40% and 20%. It is not the measure here; this table counts `fix` findings.

## Verdict

**GT12J.1 passes, scoped. Confidence: medium.**

- Seeded recall passes outright: 15/15.
- Control false alarms on the four valid controls pass: 1/12, the Pass row.
- csv-sum's control is fixture-bound and stays out of the count.
- `review-deep` stays at strong/`high`. The human-labeled set stays deferred; its trigger is above 20% at `high`, and 1/12 is 8%.

The Result call's rerun rule ("2/3 or more flagged: my (i) typing was wrong") counted flagged cells. What it meant to test was whether the findings typed (i) would come back. They did not, so its premise is refuted. For the next rerun rule: condition on whether the same issue comes back, not on how many cells are flagged.

A finding labelled `concern` with action `fix` appeared 3 times: original csv r3, sql-user r2 and fix3 r2. Two of the three were real defects, so the action may be right and the label wrong. They are typed in the table above and quoted here; they are not built as reviewer eval cases, and no prompt change is made on n=3. fix3 r2 is quoted under Results. The other two, verbatim from `benchmarks/runs/eng2-review-high-r3/review-csv-sum-control-high/branch-review.md` and `benchmarks/runs/eng2-review-high-r2/review-sql-user-control-high/branch-review.md`:

```text
sales.js:3-5; concern; valid rows dropped; parsing splits on `\n` before quotes, so a valid quoted field holding a newline (`1,"a\nb",5`) makes both lines open-quote and the row's amount vanishes from the total (probe returns 3, not 8); fix
db.js:10-12; concern; plan Goal (return row or undefined for unchecked web input); risk: a request-parsed object or array username (e.g. `?username[x]=1`) makes `.get(username)` read it as named parameters and throw `Unknown named parameter 'username'` / `'0'` instead of returning undefined, so one crafted request raises an uncaught error; no SQL injection, since the query binds `?`; guard with `if (typeof username !== 'string') return undefined;` before the query; fix
```

## The landed reference differs from the measured one

The csv-sum reference landed with this result is one fix past the one fix3 measured: a `"` opens a quoted field only as the field's first character, and elsewhere it is a literal character. The two fix3 probes are cases in `tests/csv-sum-reference.test.mjs`. That reference was not run through the reviewer.

## What this does not show

- No tier demotion. That needs the cheaper tier measured, and no `medium` rerun was run.
- No low rate. The 95% upper bound for 1/12 is about 38%.
- Nothing about csv-sum's control number. A future sweep should type its findings by hand, or rebuild it under a new task id whose Goal bounds the breakage; the current Goal stays so seeded and build results stay comparable.
- The typings were made by hand after the results were seen; 3 of the 4 original flags were re-typed (i). The verdict does not rest on a recount that pools those, which is why csv-sum is reported unmeasured.
- n=3 rounds per cell, one reviewer model, five small tasks.
- Raw cells sit in git-ignored `benchmarks/runs/`; this file and the three sweep reports are the record.
