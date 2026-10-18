# Model and effort sweep, 2026-10-18

10 cells, one `claude -p` process each with the model and effort its row names, n=1. Claude Code 2.1.302 (Claude Code), Node v24.22.0. The raw cells sit under `benchmarks/runs/`, which is git-ignored.

| Cell | Model | Effort | Defects found | False alarms | Tokens | Wall time | Cost | Detail |
|---|---|---|---|---|---|---|---|---|
| review-safe-path-seeded-high | claude-opus-5-5 | high | 1 | - | 42703 | 38s | $0.181 | verdict FINDINGS, 1 fix findings |
| review-safe-path-control-high | claude-opus-5-5 | high | - | 0 | 40507 | 42s | $0.194 | verdict FINDINGS, 0 fix findings |
| review-sql-user-seeded-high | claude-opus-5-5 | high | 1 | - | 30920 | 16s | $0.124 | verdict FINDINGS, 1 fix findings |
| review-sql-user-control-high | claude-opus-5-5 | high | - | 1 | 36068 | 26s | $0.154 | verdict FINDINGS, 1 fix findings |
| review-auth-token-seeded-high | claude-opus-5-5 | high | 1 | - | 31547 | 18s | $0.131 | verdict FINDINGS, 1 fix findings |
| review-auth-token-control-high | claude-opus-5-5 | high | - | 0 | 31945 | 17s | $0.133 | verdict CLEAN, 0 fix findings |
| review-csv-sum-seeded-high | claude-opus-5-5 | high | 1 | - | 37495 | 35s | $0.163 | verdict FINDINGS, 2 fix findings |
| review-csv-sum-control-high | claude-opus-5-5 | high | - | 1 | 42138 | 36s | $0.197 | verdict FINDINGS, 1 fix findings |
| review-rate-limit-seeded-high | claude-opus-5-5 | high | 1 | - | 31588 | 16s | $0.131 | verdict FINDINGS, 2 fix findings |
| review-rate-limit-control-high | claude-opus-5-5 | high | - | 0 | 33346 | 21s | $0.144 | verdict CLEAN, 0 fix findings |

## Reviewer false alarms

Reviewer false-alarm rate: 2/5 control branches (40%) drew at least one defect or concern finding (low 0/0, medium 0/0, high 2/5). Plan 5 (C2) is gated on this rate.

Unmeasured: 0 control cells left no report.

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
