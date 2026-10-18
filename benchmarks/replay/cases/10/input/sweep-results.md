# Model and effort sweep, 2026-10-16

10 cells, one `claude -p` process each with the model and effort its row names, n=1. Claude Code 2.1.302 (Claude Code), Node v24.22.0. The raw cells sit under `benchmarks/runs/`, which is git-ignored.

| Cell | Model | Effort | Defects found | False alarms | Tokens | Wall time | Cost | Detail |
|---|---|---|---|---|---|---|---|---|
| review-safe-path-seeded-medium | claude-opus-5-5 | medium | 1 | - | 31516 | 16s | $0.132 | verdict FINDINGS, 1 fix findings |
| review-safe-path-control-medium | claude-opus-5-5 | medium | - | 1 | 36204 | 27s | $0.155 | verdict FINDINGS, 1 fix findings |
| review-sql-user-seeded-medium | claude-opus-5-5 | medium | 1 | - | 30401 | 13s | $0.121 | verdict FINDINGS, 1 fix findings |
| review-sql-user-control-medium | claude-opus-5-5 | medium | - | 0 | 30710 | 16s | $0.123 | verdict CLEAN, 0 fix findings |
| review-auth-token-seeded-medium | claude-opus-5-5 | medium | 1 | - | 30354 | 13s | $0.121 | verdict FINDINGS, 1 fix findings |
| review-auth-token-control-medium | claude-opus-5-5 | medium | - | 0 | 31323 | 21s | $0.127 | verdict FINDINGS, 0 fix findings |
| review-csv-sum-seeded-medium | claude-opus-5-5 | medium | 1 | - | 36073 | 23s | $0.150 | verdict FINDINGS, 4 fix findings |
| review-csv-sum-control-medium | claude-opus-5-5 | medium | - | 3 | 37304 | 32s | $0.161 | verdict FINDINGS, 3 fix findings |
| review-rate-limit-seeded-medium | claude-opus-5-5 | medium | 1 | - | 30925 | 17s | $0.125 | verdict FINDINGS, 2 fix findings |
| review-rate-limit-control-medium | claude-opus-5-5 | medium | - | 1 | 35666 | 25s | $0.149 | verdict FINDINGS, 1 fix findings |

## Reviewer false alarms

Reviewer false-alarm rate: 3/5 control branches (60%) drew at least one defect or concern finding (low 0/0, medium 3/5, high 0/0). Plan 5 (C2) is gated on this rate.

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
