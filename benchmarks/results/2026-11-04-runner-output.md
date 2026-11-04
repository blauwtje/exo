# Runner output and wait replay estimate

Replayed at $0 over 223 recorded task-runner blocks (`calls.json`), applying the landed `landingForCaller` to `land-task` and `land-slot` output and `chainedForCaller` to the chained next report. Tokens are characters divided by 4. Per-block values are totals divided by 223.

| script | calls | chars per block before | chars per block after | tokens per block before | tokens per block after |
|---|---|---|---|---|---|
| land-task | 847 | 5344 | 3479 | 1336 | 870 |
| next-task | 353 | 1794 | 1794 | 448 | 448 |
| land-slot | 114 | 1121 | 858 | 280 | 214 |
| wait-report | 698 | 437 | 437 | 109 | 109 |
| remove-worktree | 22 | 100 | 100 | 25 | 25 |
| pick-reviewer | 24 | 82 | 82 | 21 | 21 |
| all scripts | | 8904 | 6775 | 2226 | 1694 |

Estimate: about 532 tokens per block less script output (24%), almost all from `land-task`.

Limits: the replay does not model the restored `wait-report.mjs`, which replaces report polling (114 wait calls in 14 of 29 later blocks); the wait row is the recorded before value. The 4 chars per token ratio is an assumption, not calibrated.
