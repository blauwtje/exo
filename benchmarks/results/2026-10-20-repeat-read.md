# Dedupe repeat Read of an unchanged range

Tested on 2026-10-20 as a $0 replay of recorded transcripts. The scripts and notes are local and untracked in the main checkout: `.exo/self-improve/tests/s5/repeat-read.mjs`, `.exo/self-improve/tests/s5/profile.mjs`, `.exo/self-improve/s5-iter4.md`, `.exo/self-improve/s5-iter4-prereg.md` and `.exo/self-improve/s5-profile.md`.

## Idea

A repeat Read of an unchanged file range returns a short stub, through a PreToolUse hook on Read or one prompt line in `review-branch-deep` and `solve-hard`. Not built.

## Method (pre-registered)

A qualifying repeat is the same path, offset and limit within one agent session, with no Edit or Write on the path and no Bash naming its basename in between, and a result of at least 300 characters. Saving is (result tokens - 40) at the cache write price plus the read price for each remaining request. Metric is saving over the cost of `review-branch-deep` plus `solve-hard`, non-sweep, with a 10,000-resample bootstrap 95% CI. Bar: at least 3% and a CI low above 0.

## Results

- Primary: 280 agents, $168.24, 0 qualifying repeats. Saving 0.00%, 95% CI [0.00, 0.00].
- All agent types: 26 repeats in 23 of 5,980 agents ($3,081), about $0.10 in total.
- The profile's 5.4% and 4.0% "re-Read" shares were different ranges of one file, or re-reads after an edit, which a stub cannot replace.
- Not checked: whether the harness already stubs exact repeats (results under 300 characters were skipped).

Verdict: rejected, 0.00% against a 3% bar.

## Real-use cost profile (other projects: 209 runs, $784, $3.75 per run)

- Lead is 41% of cost (Opus, 1h cache), `build-task` 26%, `solve-hard` 9%, `general-purpose` 7%, `run-unit` 6%, `review-branch-deep` 5%.
- Exo-repo sessions ($2,521) are 47% `general-purpose` dev agents.
- Output (thinking) tokens are 26-41% of every agent's cost; tool-result carry is next (Bash 13-25%, Read 4-22%).
- Exo script output is under 2% of lead cost; turn-1 context is 5-10% per agent.
- Cache misses on `run-unit` (12%) are covered by [2026-10-20-cache-ttl-real-use.md](2026-10-20-cache-ttl-real-use.md).
- The larger buckets (thinking output, Bash source reads, turn count) need a paid A/B.
