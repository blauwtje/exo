# Baseline pool: content keys replayed over rounds 2-8

Replays the content-keyed baseline pool ([L3.3](2026-10-20-self-improve-ideas.md)) over the base arms of rounds 2, 3, 4, 6, 7 and 8 with `node benchmarks/baseline-pool.mjs replay`. Key: sha256 over the loaded files at the arm's commit (`agents/`, `skills/`, `hooks/`, `lib/`, `bin/`, `harnesses/`, `install.mjs`, `verify.mjs`), `benchmarks/sweep-fixtures.mjs` and `benchmarks/flow-hidden/`, plus cell `flow-unit`, model `claude-sonnet-5-5`, effort `high`. Only round 4 recorded its Claude Code version (2.1.303, [results](2026-10-19-speed-round4.md)), so the replay gives it that version and rounds 2, 3, 6, 7 and 8 the placeholder `unrecorded`; a real `add` needs the version. Tests: Mann-Whitney, two-sided, normal approximation with tie correction (`mannWhitney` in `benchmarks/statistics.mjs`). Rounds 2-6 rows are in their own results files; rounds 7-8 rows are copied below from the local `.exo/speed7/ab7.txt` and `.exo/speed8/ab8.txt`.

## Pairs

Arm commits: r2 `c087a7aa`, r3 `71a42460`, r4 `6a7d8012`, r6 `31ece02e`, r7 `8d4e6207`, r8 `82ae8607`. Round 2 has n=5, the others n=15. Round 2 ran on `c087a7aa`, a run-branch commit not on `main`, so the replay keys round 2 by `71a42460`, its squash commit with the same keyed files.

| pair | key | cost p (shift) | tokens p | wall p |
|---|---|---|---|---|
| r2 vs r3 | match | 0.315 (-2%) | 0.570 | 0.760 |
| r2 vs r4 | no match | 0.631 (0%) | 0.896 | 0.315 |
| r2 vs r6 | match | 0.965 (3%) | 0.694 | 0.315 |
| r2 vs r7 | no match | 0.074 (-10%) | 0.074 | 0.694 |
| r2 vs r8 | no match | 0.088 (-11%) | 0.089 | 0.006 |
| r3 vs r4 | no match | 0.300 (3%) | 0.443 | 0.040 |
| r3 vs r6 | match | 0.300 (5%) | 0.254 | 0.021 |
| r3 vs r7 | no match | 0.135 (-7%) | 0.029 | 0.633 |
| r3 vs r8 | no match | 0.049 (-9%) | 0.049 | 0.000 |
| r4 vs r6 | no match | 0.520 (2%) | 0.852 | 0.787 |
| r4 vs r7 | no match | 0.015 (-10%) | 0.004 | 0.017 |
| r4 vs r8 | no match | 0.015 (-11%) | 0.008 | 0.000 |
| r6 vs r7 | no match | 0.014 (-12%) | 0.005 | 0.029 |
| r6 vs r8 | no match | 0.014 (-14%) | 0.008 | 0.000 |
| r7 vs r8 | no match | 0.590 (-2%) | 0.756 | 0.000 |

Three pairs share a key (rounds 2, 3 and 6 loaded the same files and have no recorded version; round 4 loaded the same files but recorded version 2.1.303, so it pairs with nothing), three of three have cost and tokens p > 0.05, so `replay` exits 0. Round 7 differs from round 6 in 14 runtime files (`git diff --stat 31ece02e 8d4e6207`), and round 8 differs from round 7 only in `benchmarks/sweep-fixtures.mjs` and `benchmarks/flow-hidden/truncate.test.js`, so neither pairs with an earlier round. Their pairs with rounds 4 and 6 have cost p of 0.014 to 0.015, the shift a key mismatch is meant to catch.

Wall is not served: among matched pairs rounds 3 vs 6 (p=0.021) differ on wall with identical keys, and round 7 vs 8 shifted -28% (p<0.001) under different keys. Limits: the pairs are not independent (three pairs come from three arms of one key), n=15 detects only about 10% shifts, so p > 0.05 is weak evidence of equality, and round 3's reviewer pinning is not in the key.

## Saved per round

A round that reuses an earlier round's baseline skips its base arm; the saving is that arm's cost in the round.

| round | n | base cost saved |
|---|---|---|
| r2 | 5 | $0.00 |
| r3 | 15 | $9.84 |
| r4 | 15 | $0.00 |
| r6 | 15 | $10.37 |
| r7 | 15 | $0.00 |
| r8 | 15 | $0.00 |

Total $20.21 across rounds 3 and 6 had the pool existed; rounds 2, 4, 7 and 8 saved nothing (first of their key). Cost, token and quality questions only; wall questions still need a fresh baseline arm.

## Round 7 base rows

| run | wall s | cost $ | tokens | tokens excl. review+fix | review-branch | fix-review | lead calls | run-unit calls | run-unit wall s | hidden | landed |
|---|---|---|---|---|---|---|---|---|---|---|---|
| r7-base-1 | 161.1 | 0.572 | 221416 | 200524 | 1 | 0 | 15 | 10 | 90 | 17/17 | 4/4 |
| r7-base-2 | 129.1 | 0.616 | 237619 | 211619 | 1 | 0 | 15 | 10 | 62 | 17/17 | 4/4 |
| r7-base-3 | 180.4 | 0.606 | 239057 | 221568 | 1 | 0 | 15 | 11 | 87 | 17/17 | 4/4 |
| r7-base-4 | 193.4 | 0.529 | 204995 | 186749 | 1 | 0 | 12 | 10 | 103 | 17/17 | 4/4 |
| r7-base-5 | 184.2 | 0.563 | 215508 | 192071 | 1 | 0 | 16 | 9 | 95 | 17/17 | 4/4 |
| r7-base-6 | 197.8 | 0.591 | 213748 | 183526 | 1 | 0 | 13 | 9 | 96 | 17/17 | 4/4 |
| r7-base-7 | 187.6 | 0.617 | 226101 | 197224 | 1 | 0 | 13 | 9 | 96 | 17/17 | 4/4 |
| r7-base-8 | 229.2 | 0.708 | 265848 | 220986 | 2 | 1 | 17 | 10 | 99 | 17/17 | 4/4 |
| r7-base-9 | 192.9 | 0.602 | 231960 | 208387 | 1 | 0 | 17 | 11 | 100 | 17/17 | 4/4 |
| r7-base-10 | 317.8 | 0.822 | 299486 | 231929 | 2 | 1 | 20 | 12 | 104 | 17/17 | 4/4 |
| r7-base-11 | 165.1 | 0.553 | 213843 | 194441 | 1 | 0 | 15 | 10 | 88 | 17/17 | 4/4 |
| r7-base-12 | 183.3 | 0.484 | 213029 | 200010 | 1 | 0 | 15 | 11 | 107 | 17/17 | 4/4 |
| r7-base-13 | 198.2 | 0.680 | 292332 | 237200 | 2 | 1 | 19 | 10 | 80 | 17/17 | 4/4 |
| r7-base-14 | 169.8 | 0.604 | 229322 | 206210 | 1 | 0 | 16 | 9 | 86 | 17/17 | 4/4 |
| r7-base-15 | 158.9 | 0.562 | 214119 | 195616 | 1 | 0 | 15 | 11 | 84 | 17/17 | 4/4 |

## Round 8 new rows

| run | wall s | cost $ | tokens | tokens excl. review+fix | review-branch | fix-review | lead calls | run-unit calls | run-unit wall s | hidden | landed |
|---|---|---|---|---|---|---|---|---|---|---|---|
| r8-new-1 | 138.7 | 0.688 | 258998 | 225277 | 1 | 0 | 17 | 9 | 64 | 17 | 4/4 |
| r8-new-2 | 155.4 | 0.659 | 242048 | 209704 | 1 | 0 | 14 | 12 | 71 | 17 | 4/4 |
| r8-new-3 | 101.5 | 0.539 | 237495 | 218257 | 1 | 0 | 16 | 10 | 61 | 17 | 4/4 |
| r8-new-4 | 130.4 | 0.571 | 219013 | 197511 | 1 | 0 | 14 | 10 | 59 | 17 | 4/4 |
| r8-new-5 | 129.0 | 0.616 | 239851 | 210496 | 1 | 0 | 17 | 10 | 61 | 17 | 4/4 |
| r8-new-6 | 166.4 | 0.671 | 256280 | 212981 | 1 | 1 | 15 | 10 | 60 | 17 | 4/4 |
| r8-new-7 | 124.9 | 0.568 | 225339 | 205870 | 1 | 0 | 16 | 10 | 66 | 17 | 4/4 |
| r8-new-8 | 129.6 | 0.568 | 228178 | 210082 | 1 | 0 | 17 | 10 | 69 | 17 | 4/4 |
| r8-new-9 | 153.8 | 0.611 | 228979 | 199443 | 1 | 0 | 15 | 9 | 70 | 17 | 4/4 |
| r8-new-10 | 205.2 | 0.781 | 294607 | 238505 | 2 | 1 | 20 | 9 | 67 | 17 | 4/4 |
| r8-new-11 | 121.9 | 0.544 | 216164 | 199384 | 1 | 0 | 16 | 10 | 63 | 17 | 4/4 |
| r8-new-12 | 125.8 | 0.555 | 214368 | 189231 | 1 | 0 | 12 | 10 | 57 | 17 | 4/4 |
| r8-new-13 | 134.1 | 0.560 | 209316 | 188936 | 1 | 0 | 13 | 9 | 59 | 17 | 4/4 |
| r8-new-14 | 109.7 | 0.479 | 206421 | 186348 | 1 | 0 | 14 | 9 | 58 | 17 | 4/4 |
| r8-new-15 | 122.8 | 0.555 | 219981 | 202094 | 1 | 0 | 16 | 11 | 68 | 17 | 4/4 |
