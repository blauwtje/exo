# Model and effort sweep, 2026-11-08

3 cells, one `claude -p` process each with the model and effort its row names, n=1. Claude Code 2.1.319 (Claude Code), Node v24.22.0. The raw cells sit under `benchmarks/runs/`, which is git-ignored.

| Cell | Model | Effort | Defects found | False alarms | Tokens | Wall time | Cost | Detail |
|---|---|---|---|---|---|---|---|---|
| flow-unit | claude-sonnet-5-5 | high | - | - | 86207 | 52s | $0.194 | 4/4 tasks landed (0/4 Plan-task trailers), hidden check pass, 0 drift reports, review verdict none, review stages 0 review-branch 0 fix-review (fix=- concern=-), tokens excl. review and fix 86207 |
| flow-unit | claude-sonnet-5-5 | high | - | - | 210729 | 107s | $0.485 | 4/4 tasks landed (4/4 Plan-task trailers), hidden check pass, 0 drift reports, review verdict none, review stages 0 review-branch 0 fix-review (fix=- concern=-), tokens excl. review and fix 210729 |
| flow-unit | claude-sonnet-5-5 | high | - | - | 193147 | 118s | $0.441 | 4/4 tasks landed (4/4 Plan-task trailers), hidden check pass, 0 drift reports, review verdict none, review stages 0 review-branch 0 fix-review (fix=- concern=-), tokens excl. review and fix 193147 |

## Reviewer false alarms

No control review cell left a report, so the false-alarm rate is unmeasured and plan 5 (C2) has no gate yet.

## Replayed reviews

No replay cell ran.

## Planning

No plan cell wrote a plan, so Fable 5.1 routing stays unsettled.

## Whole flow

The whole-flow cell did not run.

## Limitations

- Each cell ran once, so a difference of one finding between two cells is within noise.
- Defects found means, per kind: review seeded, a `fix` finding overlapping the seeded defect; build, the fixture check failing on the built code; plan, rule breaches; flow, defects the branch review reported.
- A seeded review cell counts its defect as found only when a `fix` finding overlaps the lines of the defect; a control branch carries the reference solution, so every `fix` finding it draws counts as a false alarm.
- A plan cell counts the plan-spec rules a script can check; whether its code runs is not measured.
- Tokens weigh input as token-weights.mjs does, summed over the main thread and every delegate; cost is the client-side list-price estimate.

## Comparison with the baseline

Baseline: flow-unit at 5033ef24, 3 of 3 pass, $0.418 (sd 0.187) and 105.3 s (sd 45.1), recorded in docs/plans/karpathy.md
Excluded: candidate row 1 of the table above (landed 0 of 4 Plan-task trailers, so it skipped the plan loop)

| Metric | Baseline mean | Flow runs, rows 2 and 3 (n=2) | Rise |
|---|---|---|---|
| Cost | $0.418 | $0.463 | 10.8% |
| Wall time | 105.3 s | 112.5 s | 6.8% |

Verdict: cost within noise, the 2-run mean sits well inside the baseline's spread of $0.187
Verdict: wall within noise, the 2-run mean sits well inside the baseline's spread of 45.1 s
Verdict: tokens unmeasured, the baseline records no token mean

All 3 runs passed the hidden check. The sweep shows neither an improvement nor a regression against the baseline; the earlier all-runs mean ($0.373 / 92.3 s) was lower only because it included row 1, which bypassed the flow.
