# Model and effort sweep, 2026-11-05

3 cells, one `claude -p` process each with the model and effort its row names, n=1. Claude Code 2.1.318 (Claude Code), Node v24.22.0. The raw cells sit under `benchmarks/runs/`, which is git-ignored.

| Cell | Model | Effort | Defects found | False alarms | Tokens | Wall time | Cost | Detail |
|---|---|---|---|---|---|---|---|---|
| flow-unit | claude-sonnet-5-5 | high | - | - | 211145 | 122s | $0.567 | 4/4 tasks landed (4/4 Plan-task trailers), hidden check pass, 0 drift reports, review verdict none, review stages 1 review-branch 0 fix-review (fix=0 concern=0), tokens excl. review and fix 185853 |
| flow-unit | claude-sonnet-5-5 | high | - | - | 214649 | 126s | $0.593 | 4/4 tasks landed (4/4 Plan-task trailers), hidden check pass, 0 drift reports, review verdict none, review stages 1 review-branch 0 fix-review (fix=0 concern=0), tokens excl. review and fix 181899 |
| flow-unit | claude-sonnet-5-5 | high | - | - | 167479 | 114s | $0.486 | 4/4 tasks landed (4/4 Plan-task trailers), hidden check pass, 0 drift reports, review verdict none, review stages 1 review-branch 0 fix-review (fix=0 concern=0), tokens excl. review and fix 143421 |

## Reviewer false alarms

No control review cell left a report, so the false-alarm rate is unmeasured and plan 5 (C2) has no gate yet.

## Replayed reviews

No replay cell ran.

## Planning

No plan cell wrote a plan, so Fable 5.1 routing stays unsettled.

## Whole flow

The whole-flow cell did not run.

## Role read shares

Build-task cost $0.483, of which Read results were 34,104 estimated tokens of 148,229 weighted input (23.0%). Almost all of it was exo rule docs: `skills/route-skills/references/code-standard.md` about 20.0k tokens, `lean.md` about 6.8k, `.exo/run-rules.md` about 4.5k and task briefs about 3.7k. It made zero Read calls on fixture source or dependency files.

Review-branch cost $0.462, of which Read results were 9,543 of 71,377 weighted input (13.4%). It read `code-standard.md` about 5.0k and `review-rules.md` about 4.8k, plus `.exo/review-input.md` through Bash, and made zero whole source-file reads.

The main thread cost $0.450 and the task-runner $0.251. All figures are over 3 flow cells.

## Limitations

- Each cell ran once, so a difference of one finding between two cells is within noise.
- Defects found means, per kind: review seeded, a `fix` finding overlapping the seeded defect; build, the fixture check failing on the built code; plan, rule breaches; flow, defects the branch review reported.
- A seeded review cell counts its defect as found only when a `fix` finding overlaps the lines of the defect; a control branch carries the reference solution, so every `fix` finding it draws counts as a false alarm.
- A plan cell counts the plan-spec rules a script can check; whether its code runs is not measured.
- Tokens weigh input as token-weights.mjs does, summed over the main thread and every delegate; cost is the client-side list-price estimate.
