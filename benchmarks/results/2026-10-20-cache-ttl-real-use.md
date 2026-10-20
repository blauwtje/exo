# Cache TTL ideas on real-use transcripts

Two cache-TTL ideas, both tested on 2026-10-20 as $0 replays of recorded subagent transcripts (`~/.claude/projects/*/<session>/subagents/*.meta.json` for the agent type, the `.jsonl` for per-request usage). A transcript counts as "sweep" when its project dir contains `exo-sweep`; every other transcript is "real use". The scripts and notes are local and untracked in the main checkout: `.exo/self-improve/tests/s5/split-replay.mjs`, `.exo/self-improve/tests/s5/ttl-other.mjs`, `.exo/self-improve/s5-ttl-other.md` and `.exo/self-improve/progress.md` (Session 5, iterations 1 and 2).

## Method

Each request's cache write is repriced under the other TTL. With a 1h TTL, a request 300-3600 s after the previous one reads the cache where a 5m TTL would have rewritten it; with a 5m TTL those requests pay a write. Gaps of 300 s or less do not change. Gaps are measured start to start. `split-replay.mjs` counts the gaps over 300 s per project class. `ttl-other.mjs` bootstraps a 95% confidence interval of the saving per agent type.

## Test 1: run-unit cache TTL from 1 hour back to 5 minutes

| Class | Agents | Cost at 1h | Cost at 5m | Gaps over 300 s |
|---|---|---|---|---|
| sweep | 167 | $11.42 | $7.14 | 0 |
| real use | 442 | $5.21 | $8.26 (+58%) | 215 of 11,166 |

A pooled replay over all 609 agents showed $16.63 to $15.39 (-7.5%), which hid the split. Verdict: rejected. Dropping the 1h TTL makes real use cost 58% more.

## Test 2: 1 hour cache TTL on build-task, review-branch and fix-review

Saving is the change in cache spend under 1h; negative means 1h costs more.

| Agent type | Real-use sessions | Saving | 95% CI |
|---|---|---|---|
| build-task | 2919 | -33.0% | [-34.4, -31.5] |
| review-branch | 444 | -43.8% | [-44.9, -42.8] |
| fix-review | 123 | -41.4% | [-43.3, -39.7] |

Verdict: rejected for all three. Few of their gaps pass 300 s (build-task: 48 of 2919 sessions), so the dearer 1h write is rarely repaid by a later read.

## Lesson

Sweep cells never idle for 5 minutes, so a sweep-only replay overstates what a short TTL saves and understates what a long one is worth. Judge any TTL idea on real-use transcripts.
