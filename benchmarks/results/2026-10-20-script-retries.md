# Retries after exo script errors, mined from run transcripts

Tested on 2026-10-20 as a $0 replay of recorded transcripts (`~/.claude/projects/*/`, top-level sessions plus `subagents/*.jsonl`). The script and notes are local and untracked in the main checkout: `.exo/self-improve/tests/s5/script-retries.mjs` and `.exo/self-improve/s5-script-retries.md`.

## Method

A run is one top-level session with a Bash call to `skills/build/scripts/*.mjs`. An event is an error from an exo script (`is_error`, an `Exit code`, or `usage:` / `ERROR` / unknown-flag text) followed by another call of the same script by the same agent within the next 3 Bash calls. Event cost is the requests from the failing call to the retry, priced with `benchmarks/prices.mjs`. Pre-registered bar: at least 0.5 events per run or at least 2% of run cost, non-sweep.

## Results

| Class | Run sessions | Run cost | Events (all scripts) | Event cost |
|---|---|---|---|---|
| non-sweep | 1,198 | $3,386.79 | 1,694 | $50.54 (1.49%) |
| sweep | 350 | $217.96 | 41 | $1.15 (0.53%) |

The best script, `land-task.mjs`, has 0.264 events per run and 0.165% of run cost. Every other script is lower (`exo-cli` 0.067, `wait-report` 0.052, `verify` 0.048, `next-task` 0.034 events per run; each under 0.14% of cost). Even with every script error removed at no cost, the gain is 1.49%, under the 2% bar.

Most events are not script text: permission denials and hook messages, and real state failures (path outside `Files:`, missing build report, wait timeout). The one repeating text cause is `unknown flag '--help'` (6 in `land-task`, 6 in `wait-report`), worth under 0.01% of run cost.

Verdict: rejected. Caveats: text-rule false positives inflate the counts, retries beyond 3 Bash calls are not counted, and the failing request is excluded from cost.
