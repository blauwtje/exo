# Model and effort sweep, 2026-11-09

15 cells, one `claude -p` process each with the model and effort its row names, n=1. Claude Code 2.1.319 (Claude Code), Node v24.22.0. The raw cells sit under `benchmarks/runs/`, which is git-ignored.

| Cell | Model | Effort | Defects found | False alarms | Tokens | Wall time | Cost | Detail |
|---|---|---|---|---|---|---|---|---|
| flow-unit | claude-sonnet-5-5 | high | - | - | 105708 | 93s | $0.240 | 4/4 tasks landed (0/4 Plan-task trailers), hidden check pass, 0 drift reports, review verdict none, review stages 0 review-branch 0 fix-review (fix=- concern=-), tokens excl. review and fix 105708 |
| flow-unit | claude-sonnet-5-5 | high | - | - | 179283 | 96s | $0.409 | 4/4 tasks landed (4/4 Plan-task trailers), hidden check pass, 0 drift reports, review verdict none, review stages 0 review-branch 0 fix-review (fix=- concern=-), tokens excl. review and fix 179283 |
| flow-unit | claude-sonnet-5-5 | high | - | - | 163232 | 82s | $0.372 | 4/4 tasks landed (4/4 Plan-task trailers), hidden check pass, 0 drift reports, review verdict none, review stages 0 review-branch 0 fix-review (fix=- concern=-), tokens excl. review and fix 163232 |
| flow-unit | claude-sonnet-5-5 | high | - | - | 194959 | 103s | $0.444 | 4/4 tasks landed (4/4 Plan-task trailers), hidden check pass, 0 drift reports, review verdict none, review stages 0 review-branch 0 fix-review (fix=- concern=-), tokens excl. review and fix 194959 |
| flow-unit | claude-sonnet-5-5 | high | - | - | 115902 | 73s | $0.252 | 4/4 tasks landed (0/4 Plan-task trailers), hidden check pass, 0 drift reports, review verdict none, review stages 0 review-branch 0 fix-review (fix=- concern=-), tokens excl. review and fix 115902 |
| flow-unit | claude-sonnet-5-5 | high | - | - | 209417 | 165s | $0.564 | 4/4 tasks landed (4/4 Plan-task trailers), hidden check pass, 0 drift reports, review verdict none, review stages 0 review-branch 0 fix-review (fix=- concern=-), tokens excl. review and fix 209417 |
| flow-unit | claude-sonnet-5-5 | high | - | - | 205166 | 179s | $0.538 | 4/4 tasks landed (4/4 Plan-task trailers), hidden check pass, 0 drift reports, review verdict none, review stages 0 review-branch 0 fix-review (fix=- concern=-), tokens excl. review and fix 205166 |
| flow-unit | claude-sonnet-5-5 | high | - | - | 151887 | 101s | $0.354 | 4/4 tasks landed (4/4 Plan-task trailers), hidden check pass, 0 drift reports, review verdict none, review stages 0 review-branch 0 fix-review (fix=- concern=-), tokens excl. review and fix 151887 |
| flow-unit | claude-sonnet-5-5 | high | - | - | 175822 | 139s | $0.468 | 4/4 tasks landed (4/4 Plan-task trailers), hidden check pass, 0 drift reports, review verdict none, review stages 1 review-branch 0 fix-review (fix=- concern=-), tokens excl. review and fix 155543 |
| flow-unit | claude-sonnet-5-5 | high | - | - | 77071 | 94s | $0.193 | 4/4 tasks landed (0/4 Plan-task trailers), hidden check pass, 0 drift reports, review verdict none, review stages 0 review-branch 0 fix-review (fix=- concern=-), tokens excl. review and fix 77071 |
| flow-unit | claude-sonnet-5-5 | high | - | - | 166553 | 113s | $0.377 | 4/4 tasks landed (4/4 Plan-task trailers), hidden check pass, 0 drift reports, review verdict none, review stages 0 review-branch 0 fix-review (fix=- concern=-), tokens excl. review and fix 166553 |
| flow-unit | claude-sonnet-5-5 | high | - | - | 161418 | 128s | $0.370 | 4/4 tasks landed (4/4 Plan-task trailers), hidden check pass, 0 drift reports, review verdict none, review stages 0 review-branch 0 fix-review (fix=- concern=-), tokens excl. review and fix 161418 |
| flow-unit | claude-sonnet-5-5 | high | - | - | 197130 | 137s | $0.441 | 4/4 tasks landed (4/4 Plan-task trailers), hidden check pass, 0 drift reports, review verdict none, review stages 0 review-branch 0 fix-review (fix=- concern=-), tokens excl. review and fix 197130 |
| flow-unit | claude-sonnet-5-5 | high | - | - | 72778 | 84s | $0.174 | 4/4 tasks landed (0/4 Plan-task trailers), hidden check pass, 0 drift reports, review verdict none, review stages 0 review-branch 0 fix-review (fix=- concern=-), tokens excl. review and fix 72778 |
| flow-unit | claude-sonnet-5-5 | high | - | - | 172225 | 131s | $0.436 | 4/4 tasks landed (4/4 Plan-task trailers), hidden check pass, 0 drift reports, review verdict none, review stages 1 review-branch 0 fix-review (fix=- concern=-), tokens excl. review and fix 160450 |

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
