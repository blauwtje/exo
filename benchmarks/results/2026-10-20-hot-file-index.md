# Hot-file index for locate-code and find-open-points

Tested on 2026-10-20 as a $0 offline replay of recorded real-use transcripts. Scripts, prereg and notes are local and untracked in the main checkout under `.exo/self-improve/s9/` (r6-test-K3.md, prereg r6-test-K3-prereg.md; script tests/K3/replay.mjs).

Idea: an index of the files that other sessions read most replaces whole-file Reads by the agents with cited ranges plus a pointer.

Verdict: FAIL ($0 spent, no branch). Replayed saving 2.78% of the two agents' cost ($0.80 of $28.84), cluster-bootstrap 95% CI [1.33%, 4.52%]; lower bound under the 3.0% bar. About 0.2% of a run (the agents are about 1.5% of a run).

## Evidence
- Corpus: 232 locate-code and find-open-points transcripts after 2026-10-09, 98 sessions, usage-priced bucket $28.84 (the gate's $28.8). Sample floor met: 98 replaced reads, 27 sessions with a saving.
- Whole-file Reads of hot files (read by at least 3 other sessions, leave-one-out) carry $1.35, not the gate's $2.79, which included ranged reads and greps. Removing 100% of it is 4.7% of the bucket, so the bar needs a 64% cut of that carry; the replay cuts 59%.
- Quality guard passed: 0 of 1058 cited lines fall outside the kept ranges (by construction, with 25 lines of padding on each side). 21 of 98 replaced reads had no citation or grep hit and used the 40-line floor.

## Caveats
- The cost of building and reading the index is not charged, so the true saving is lower still.
- Overlaps the rejected range reads above a size line and the batched read verb.
