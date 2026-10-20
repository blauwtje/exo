# Range reads above a size line for build-task

Tested on 2026-10-20 as a $0 offline replay of recorded real-use transcripts. Scripts, prereg and notes are local and untracked in the main checkout under `.exo/self-improve/s7/` (prereg r4-test-I3-prereg.md, scripts tests/I3/replay.mjs and dbg.mjs).

Idea: `build-task` reads a file over N lines (default 400) as `grep -n <symbol>` plus `Read` with `offset` and `limit`, never a whole-file `Read`.

## Data (real use, agents started on or after 2026-10-09)
- 504 build-tasks, $77.53. Flagged: 56 agents, 70 whole-file reads (Read with no `limit` or `offset`, result over 8,000 chars, task briefs excluded). The earlier count of 75 agents and 100 reads included briefs. Paths: source 54, doc 13, `.exo` file 3.
- Replay: each flagged read becomes the 40 lines around the first later Edit or grep hit in that file, 20% of the chars if none; carry recomputed per request at the model that ran (Sonnet-5-5 cacheRead $0.10 per M for most).
- Quality guard: 1 of 56 flagged agents (1.8%) cites or edits a line outside every replayed range; limit 20%. It passes but is weak.

## Readings of the bar
- (a) Bucket = carry cost of the flagged reads: net saving 60.8% of the bucket, CI 57.6 to 63.4. Passes but is vacuous: the bucket is 1.73% of build-task cost, so 3% of it is 0.05% of build-task cost.
- (b) Bucket = total cost of the flagged agents: 5.66% of $14.43, CI 4.48 to 7.04. Passes, but fails if the fallback keeps 60% of the chars (2.01%, CI 1.48 to 2.62).
- (c) The gate's wording, 3% of build-task cost: 1.05% of $77.53, CI 0.75 to 1.38. FAIL. The gate's estimate of the bucket (about 5% of build-task cost) was 2.9 times too high, because it priced carry at $0.30 per M for every request; priced per request at the model that ran, the bucket is $1.34.
- The tester returned BLOCKED on the reading; the lead ruled reading (c), the gate's own, FAIL.

## Sensitivity and caveats
- The 20% fallback is an assumption and decides the result for 96% of reads. Fallback keeping 40%: 41.2% of bucket, 0.71% of build-task cost; keeping 60%: 21.6%, 0.37%.
- Characters per token 3.0 or 4.0: net 1.28% or 0.88% of build-task cost.
- Line-count flag (over 400 lines): 20 flagged agents, below the floor of 30, inconclusive.
- Pre-2026-10-09 data (1,601 build-tasks, 172 flagged): 0.48% of build-task cost, guard 22 of 172 (12.8%).
- No credit for fewer thinking tokens, no cost for extra turns beyond one per read; the guard cannot see what a fallback agent would need from the unread 80%.
- No change that touches only this bucket can reach 3% of build-task cost: it would need a saving above 60% of the bucket's gross.

## Verdict
FAIL, reject. $0 spent, no branch. Expected value if built anyway: about $0.8 per 504 build-tasks, about 0.2% of run.
