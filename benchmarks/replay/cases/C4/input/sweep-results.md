# Model and effort sweep, 2026-10-17

4 cells, one `claude -p` process each with the model and effort its row names, n=1. Claude Code 2.1.302 (Claude Code), Node v24.22.0. The raw cells sit under `benchmarks/runs/`, which is git-ignored.

| Cell | Model | Effort | Defects found | False alarms | Tokens | Wall time | Cost | Detail |
|---|---|---|---|---|---|---|---|---|
| review-safe-path-control-medium | claude-opus-5-5 | medium | - | 0 | 31004 | 21s | $0.125 | verdict CLEAN, 0 fix findings |
| review-sql-user-control-medium | claude-opus-5-5 | medium | - | 0 | 30057 | 16s | $0.116 | verdict CLEAN, 0 fix findings |
| review-auth-token-control-medium | claude-opus-5-5 | medium | - | 0 | 31983 | 16s | $0.133 | verdict CLEAN, 0 fix findings |
| review-rate-limit-control-medium | claude-opus-5-5 | medium | - | 0 | 31391 | 23s | $0.125 | verdict CLEAN, 0 fix findings |

## Reviewer false alarms

Reviewer false-alarm rate: 0/4 control branches (0%) drew at least one defect or concern finding (low 0/0, medium 0/4, high 0/0). Plan 5 (C2) is gated on this rate.

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
