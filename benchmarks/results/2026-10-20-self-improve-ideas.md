# Self-improve idea scores, 2026-10-20

Sixteen ideas from six lenses (L1 hand-edits, L2 failures, L3 experiment economics, L4 idea store, L5 context economy, L6 runtime adaptation), each scored against a threshold set before measuring. Source: the local `.exo/self-improve/scores-L*.md` and `ideas.md` files (not committed). Cost is $0 unless stated; every offline test ran in under 10 s. Thresholds were not moved after measuring. Ideas that scored PASS still carry the caveat named in their entry.

Tally: PASS as written 5 (L1.1, L3.3, L5.2, L6.1, and L3.1 offline only), FAIL 10 (L1.2, L1.3, L2.1, L2.2, L3.2, L4.1, L4.2, L4.3, L5.1, L6.2), INCONCLUSIVE 1 (L2.3). Each PASS carries a defect or low impact named in its entry.

## L1 Learn from hand edits (history: 3063 non-merge commits, 2026-09-10..10-20; 61 restore commits)

### L1.1 Protected-token conservation check
- Mechanism: multiset diff of backticks, numbers and boundary words per instruction diff in `npm run check`; fails `LOST` unless `Accept-cut:`.
- Threshold: recall >= 50% AND median <= 2 flags on never-restored trim commits.
- Measured: recall 38/61 = 62.3%; median 0 flags on 18 trim commits (only 18 exist, not 20; mean 1.1, max 5). n = 61 restores.
- Cost: $0.
- Verdict: PASS as written, impact small. Incremental over the landed `verify/checks/boundary-words.mjs` is 3/61 = 5% of restores. The test is circular (the cutter is found as the commit that removed the token). 59% of instruction-file commits (657/1121) would carry a LOST flag, which is friction the n = 18 sample hides.

### L1.2 Restore-to-pin memory
- Mechanism: hash lines deleted then re-added in history; a later diff deleting a pinned line prints `PINNED`.
- Threshold: >= 10 would-block events AND precision >= 60%.
- Measured: 54 pins, 27 events in 19 commits; precision 2/27 = 7.4% exact, 22.2% fuzzy (Jaccard >= 0.8). Variant "any re-add pins": 194 events, 10.8% exact.
- Cost: $0.
- Verdict: FAIL. Over 90% of blocks would hit deliberate later cuts. The overlap check recommends merging it into L1.1 and dropping it.

### L1.3 Edit-survival score
- Mechanism: share of exo-made added lines surviving 14 days via git blame; ranks files for the next experiment.
- Threshold: top-vs-bottom quartile spread >= 20 pts AND Spearman rho >= 0.4 against next-2-week fix commits.
- Measured: n = 174 files, 10598 lines; survival 79.5%, spread 72.4 pts (bottom 26.6%, top 99.0%); rho = 0.387 (min-lines 5 / 20: 0.346 / 0.347); control rho 0.116.
- Cost: $0.
- Verdict: FAIL (rho 0.387 < 0.4). The test leaks, so 0.387 is inflated; the leak-free variant leaves rho undefined. "Any change" survival is 34.1%, which the idea does not distinguish from the stated reading.

## L2 Failures (kept runs 2026-10-09..10-19, time basis file mtime)

### L2.1 Recurrence alarm
- Mechanism: parse review findings and run.log into findings.jsonl; print `RECURRING <class>` when no check covers a class.
- Threshold: (a) unmapped share of second-half findings <= 15%; (b) alarm precision >= 70%; (c) Red alarm >= 4 days before a83d9a04.
- Measured: (a) 27/158 = 17.1% (fail); (b) 10/10 alarms but non-discriminating; (c) alarm 6.2 days early (pass). n = 158 findings, 72 runs.
- Cost: $0.
- Verdict: FAIL on (a). The alias map was built on all data, so (a) is optimistic. Estimated gain about 14 min over 72 runs, and only if the user then writes the check.

### L2.2 Learned co-change rule
- Mechanism: plan-check warns "B usually changes with A" from git co-change plus block-reason files.
- Threshold: recall >= 5/8 blocked "missing from the file list" tasks; <= 1 warning per 5 tasks on 40 landed tasks.
- Measured: recall 0/7 (only 7 distinct blocks; original plans are gitignored, so an approximation was used); 4.1 warnings per 5 tasks (13 of 40 tasks warned, mostly release-file noise). n = 7 and 40.
- Cost: $0.
- Verdict: FAIL, both thresholds by a wide margin. Impact 0 repair sessions saved.

### L2.3 Failure cause field
- Mechanism: run-plan writes the full `cause:` to state.json and run.log; check fails on a refusal without reason.
- Threshold: (i) >= 50% of 22 `Full output` paths gone; (ii) >= 4/5 replayed failed sessions get a cause a reader agrees with.
- Measured: (i) 22/22 gone (pass); (ii) not runnable, no extractor and the failed sessions are deleted. n = 22.
- Cost: $0.
- Verdict: INCONCLUSIVE. Commit 6ffbf565 already fixed the placeholder; about 3 of 4 later failures still lack a cause (n = 4). Enabler only; 0 min direct gain.

## L3 Experiment economics (round-8 flow-unit transcripts, rounds 2-8)

### L3.1 Stage checkpoint fork
- Mechanism: snapshot baseline cells per stage; run the candidate only from the earliest stage it can change.
- Threshold: share of rej/nog ledger ideas resuming past `lead_setup` >= 40% (offline); online A/A stage wall sd <= 15 s and fix rate within 1/15 (paid).
- Measured: 14 of 21 = 67% (11/21 = 52% strict), by hand classification. Paid A/A not run.
- Cost: $0 spent; paid step estimated $4.5-5.0 against a $4 cap.
- Verdict: PASS offline, paid step INCONCLUSIVE. No checkpoint tooling exists (`sweep.mjs` deletes cell repos). Realistic gain about 1.4x fewer runs for review candidates (13x holds only for `review_branch` alone), 2-3x for build candidates. Corrected test: add `--keep-repo <dir>` to `sweep.mjs` first.

### L3.2 Time-paired blocks plus group-sequential stop
- Mechanism: paired diffs, O'Brien-Fleming looks, futility stop in statistics.mjs.
- Threshold: (a) paired-slot residual r >= 0.3; (b) mean runs per arm <= 10, verdict equals fixed n = 15 in every round, A/A false stops <= 5%.
- Measured: (a) pooled r = 0.06 (permutation p = 0.25, n = 50 cells); (b) mean 12.7 runs per arm, verdict match 31-100% (3 of 7 datasets under 95%), A/A false stops 9-19% as written, 1-4% t-corrected but 13.5 runs and 2 mismatches. n = 7 datasets x 1000 orderings.
- Cost: $0.
- Verdict: FAIL. The test used z bounds on a t statistic; the corrected variant still fails. Gain about 10-15% fewer runs, not 30-45%.

### L3.3 Content-keyed baseline pool
- Mechanism: reuse base cells keyed by hash of loaded files for cost, token and quality; run the candidate arm only.
- Threshold: >= 80% of key-matched base-arm pairs have p > 0.05 on cost and tokens (Mann-Whitney); wall expected to fail as control.
- Measured: 7/7 matched pairs (100%), cost shifts -2..+5%; wall control p < 0.05 in 3 of 7 (detects drift); mismatched-key pairs differ -9..-14% in 6 of 8. n = 7 pairs.
- Cost: $0.
- Verdict: PASS. Saves about $4.5 per round for cost, token and quality questions, nothing for wall. Pairs are not independent and n = 15 detects only about 10% shifts; add benchmark harness files to the key.

## L4 Idea store

### L4.1 Structured ledger with duplicate gate
- Mechanism: JSONL records plus a `--near` Jaccard check that fails a new record close to a rej/nog.
- Threshold: recall@3 >= 4/5 on cross-linked pairs AND <= 15 of 990 pairs >= tau 0.35; second pass >= 70% rank-1.
- Measured: recall@3 3/5; 45 of 990 pairs >= tau; max 2-gram Jaccard 0.132, so tau is unreachable. Second pass 13/14 = 93% but leaky. n = 45 records.
- Cost: $0.
- Verdict: FAIL. Corrected gate is rank-based (nearest rej/nog top-1 AND same component|lever key). Saving of about $2 per brainstorm round comes from `--near` as a lookup, not from tau.

### L4.2 Experiment queue ranked by power
- Mechanism: `--next` sorts un ideas by shrunk estimate over test cost using mde.mjs.
- Threshold: flags >= 3 of the 4 non-significant rounds (2, 3, 4, 7) as sub-MDE and 0 of round 6.
- Measured: rounds 2, 3 flagged; 4 and 7 have no recorded estimate; round 6 flagged (its -22% gain was partly a fix-loop imbalance, stage-matched -5.6%). MDE about 80 s at n = 5, 46 s at n = 15.
- Cost: $0.
- Verdict: FAIL as written (round 6 flagged). `mde.mjs` takes a pass rate, not seconds. Estimated saving about $54 over 6 rounds if sub-MDE rounds were bundled.

### L4.3 Retry triggers as dependency graph
- Mechanism: machine-checkable "Retry when" predicates over metrics and landed changes.
- Threshold: >= 40% of 45 `Retry when:` lines encode as `after:` or `metric:` over existing fields; `--reopen` prints fan-out dependents.
- Measured: 15/45 = 33% (58% if not-yet-existing fields count); 19 are external. `--reopen` would give "measured: yes, landed: no", not a clean reopen. n = 45.
- Cost: $0.
- Verdict: FAIL (33% < 40%, marginal). Estimated 0-1 reopenings per month. Storage recommendation (JSONL plus generated markdown) had no threshold and was not scored.

## L5 Context economy

### L5.1 Runtime context ledger plus residency ratchet
- Mechanism: token-turns by class from transcripts, run-report line, ratchet fails on exo-authored growth over 10%.
- Threshold: (a) two runs byte-identical; (b) class shares sum to 100 +/- 1%; (c) exo-authored share of flow-unit build-task within +/-5 points of the 10% corpus figure.
- Measured: (a) pass; (b) pass but vacuous; (c) 38.3% (corpus 19.0%, not 10%). n = 107 flow-unit transcripts, 2684 corpus files.
- Cost: $0.
- Verdict: FAIL on (c). Flow-unit is exo-dominated (78% of lead residency), so the "trimming wins at most 10%" claim does not hold for that arm. Supports a ledger, not the 10% premise. No direct token or wall gain.

### L5.2 Cost-ranked self-pruning of hot rules
- Mechanism: rank rules by reads x tokens, probe the top-K with the cut-rules harness, per-rule counters.
- Threshold: >= 3 of 10 top-cost non-boundary rules show no behaviour change in 5/5 probes, together >= 15% of their file's tokens.
- Measured: 4 rules unchanged at 5/5 (all in lean.md), 33% of lean.md (7% pooled across three files). n = 100 probes.
- Cost: $1.08 (cap $6).
- Verdict: PASS on the pre-set threshold, not a basis for cutting those rules. The probes are single-turn and tool-less, so the split is generic best-practice versus repo-fact rules, and the probes were not blind. Saving at most about 130k loaded tokens per 14 days, under 1% of residency.

## L6 Runtime adaptation

### L6.1 Risk-routed first attempt
- Mechanism: per-task failure-risk prior from past runs; upgrade the top quartile to a higher tier via `riskPin`.
- Threshold: held-out share of first-attempt failures in the top-25% risk bucket >= 50% and lift >= 2.0.
- Measured: 5/8 = 62%, lift 2.48 (5-95% bootstrap 0.14-1.00). The file prior adds nothing; file count alone gives 7/8 = 88%. Held-out failure rate fell to 7.2% from 27.7%. n = 262 train, 111 held-out tasks, 8 failures.
- Cost: $0; paid Test B not run.
- Verdict: PASS as written with very low power. Test B INCONCLUSIVE (regression to the mean breaks "old pin <= 1/4"; `exo run` refuses inside Claude Code). Gain about 2% of tasks. Worth a paid test only if the failure rate returns to about 25%.

### L6.2 Adaptive slot count per plan
- Mechanism: slots = min(DAG width, k) with k from recorded gate time and cores.
- Threshold: wall -15% or better on >= 60% of wide plans, no plan > 5% slower.
- Measured: 30 wide plans. No contention, k = 6 or 8: 17/30 = 57%, 0 slower, median -16.5%. With contention (stretch 0.34 per extra task) k = 6: 2/30, k = 8: 8/30, 3 slower. n = 30 plans.
- Cost: $0.
- Verdict: FAIL, even the contention-free best case misses 60%. Gain about 1-3% of overall build wall. The contention figure is one implied scalar; per-gate timings at 2, 4 and 6 concurrent slots would fix that.
