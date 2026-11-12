# adhd preregistered round, 2026-11-12

## Preregistration

`benchmarks/adhd/prereg.json`:

- cases: deliverable-commit-gate, deliverable-commit-fix, deliverable-pr-title, choice-worktree-cleanup, choice-model-choice, choice-release-now, choice-plan-split, failure-q1, ralph-vs-subagents, explain-why-three-runs, analyse-video-transcript, report-nine-changes
- samples 2, model `claude-fable-5-2`, metric "facts kept per answer, count"
- effect 1, alpha 0.05, power 0.8, maxUsd 3.3
- arms: base `.exo/adhd-honest/base-adhd.md`, candidate `output-styles/adhd.md`
- hashes: cases.jsonl `bedab04b...`, judges/facts.md `c92c415f...`, adhd.md (candidate) `edfe94cf...`, base style `5ebb9cbd...`
- variance records: `.exo/adhd-honest/records/2026-11-12T18-24-27-857Z.json`, `.exo/kept/adhd-judge-names/rb/2026-11-12T18-42-39-729Z.json`

Candidate line under `## Outranks brevity`:
`- Every figure and count the source gives for the answer stays in, past any word or bullet cap.`

Power line: `power: 12 tasks x 2 samples x 2 arms = 48 runs; an effect of 1 needs 12 tasks (alpha 0.05, power 0.8); MDE at 12 tasks is 0.982`

Stop rule (research report section 5): stop measuring and leave the style unlanded at the first of four: (1) the power gate needs more cases than the approved budget pays; (2) the frozen round ends with an upper bound below +1 fact per case; (3) the interval holds both 0 and +1: one recompute with the new SD, only inside the approved budget; (4) a case, the judge or the measure changed after the round: the round does not count. At most two frozen rounds, none again on the same 6 cases.

## Command

```
node benchmarks/adhd-score.mjs --prereg benchmarks/adhd/prereg.json --log-dir .exo/adhd-prereg/records
```

## Cap stop

The first run stopped on the cap after $0.1204: `projected_usd=2.8904 over --max-usd 2.84`. The cap was raised to 3.3 before any answers were compared. The second run is the full run.

## Paired lines

```
paired facts_kept candidate-base mean=0.083 ci95 -0.271..0.437 n=12 no effect of 1
paired gate_pass candidate-base mean=0.083 ci95 -0.182..0.349 n=12
paired facts_share candidate-base mean=0.076 ci95 -0.096..0.249 n=12 (not preregistered)
paired ratio candidate-base mean=0.101 ci95 0.036..0.167 n=12
```

## Per case

Facts the judge found missing, per answer (two answers per arm).

| case | candidate | base |
| --- | --- | --- |
| failure-q1 | 1,1 | 0,0 |
| ralph-vs-subagents | 1,0 | 0,1 |
| choice-worktree-cleanup | 0,0 | 1,0 |
| choice-model-choice | 1,1 | 1,1 |
| choice-release-now | 0,1 | 0,1 |
| choice-plan-split | 1,0 | 0,1 |
| deliverable-commit-gate | 0,0 | 0,0 |
| deliverable-commit-fix | 0,0 | 0,0 |
| deliverable-pr-title | 0,0 | 0,0 |
| explain-why-three-runs | 0,0 | 0,0 |
| analyse-video-transcript | 0,0 | 2,1 |
| report-nine-changes | 0,0 | 0,0 |

## Cost

$2.1610 (reply 2.1358, judge 0.0252) plus $0.1204 for the stopped run: $2.2814.

## Verdict

The facts_kept interval, -0.271..0.437, has its upper bound below +1 fact per case: no effect of 1 fact per case. Stop rule 2 applies. The figure-and-count line is not landed, `output-styles/adhd.md` is back at `main`, and measuring stops.

A later `--prereg` run on this `prereg.json` refuses on the `output-styles/adhd.md` hash by design: the file no longer holds the candidate line.
