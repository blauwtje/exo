# Later-round and fix-diff gate reviews

Source: main and subagent transcripts of the 11 uses in measure-fixes.md (Agent dispatch prompts, each review's final line and findings file, the fix-review results and the lead or sub-agent actions after it). Tokens per review are input + cache-read + cache-write + output, deduped per message id (same volume as Fix 3). Use 2 ran its gate inside nested general-purpose agents (four gate runs), so its dispatches sit in those agents' transcripts.

## Classification

48 review-branch dispatches over the 11 uses (use 10 has none): 27 first-round (initial batch plus its unread-files supplement, use 6 a37811), 11 later-round (re-dispatched full branch or overlap review after repairs; uses 1, 2, 3, 8), 10 fix-diff (scope=fix-diff or a review of the repair commits). The 21 later-round and fix-diff reviews are below.

"Findings" = defect + concern + question + note counts from the verdict line. "Real fix" = a finding led to a code change (fix-review `fixed`, a fix commit, or a repair agent), not only a reworded note or a rejected report.

| use | agent | kind | findings | real fix | tokens |
|---|---|---|---|---|---|
| 1 | a375e0 | later | 7 (2 defect, 5 note) | yes: dry run plans wrong variants, README quick command without producer; both fixed in shipped code | 531k |
| 1 | a222eb | later | 1 (defect) | yes: loadRuns ENOENT on budget-skipped sessions; shipped code skips `skipped` | 359k |
| 1 | ac6400 | fix-diff | 0 (CLEAN) | no | 119k |
| 2 | aaf810 | later | 7 (3 defect, 2 concern, 2 note) | yes: fix commits 42719847, 4a030f5a, a81722 | 741k |
| 2 | aff5fa | later | 4 (1 defect, 1 concern, 2 note) | yes, duplicate: land-slot seam is aaf810's defect again; test-first Red note stayed report-only | 772k |
| 2 | a5658b | fix-diff | 4 (1 defect, 1 concern, 2 note) | yes: two repair agents followed (wait-report --timeout validation, restore runner drift stop) | 282k |
| 2 | ad8b9d | later | 8 (1 defect, 3 concern, 4 note) | yes: commit 17873401 (unique next-task log names, strip TE_SIDECALL in subagent-start check) | 668k |
| 2 | aff1ab | later | 4 (1 concern, 3 note) | no | 413k |
| 2 | ab90d9 | later | 6 (1 defect, 1 question, 4 note) | no: test-first Red defect stayed report-only; final merge fix=0 | 1199k |
| 2 | a56a11 | later | 0 (CLEAN) | no | 418k |
| 3 | a8e648 | later | 7 (2 defect, 1 concern, 1 question, 3 note) | yes, outside the gate: results were sent to another agent; matching commits 5e963f92 and e2a841d3 landed later (not tied by transcript) | 557k |
| 3 | a4f9c4 | later | 3 (1 defect, 1 question, 1 note) | no (report-only) | 209k |
| 4 | a290e4 | fix-diff | 7 (1 defect, 1 concern, 5 note) | no: both findings report-only, no later dispatch | 200k |
| 5 | a893d6 | fix-diff | 5 (1 concern, 4 note) | yes: a7fdc5 fixed TAP parsing in flaky-record | 758k |
| 6 | af1295 | fix-diff | 5 (2 defect, 2 concern, 1 note) | yes: ac121b fixed=3 (stray sources.jsonl, unguarded excludeScratch in fetch.mjs) | 468k |
| 7 | abbbf1 | fix-diff | 5 (1 defect, 1 concern, 3 note) | probable: rule-restore and leftover-review agents followed within 25 minutes; not tied to these two findings | 1026k |
| 7 | a5ffed | fix-diff | 5 (2 defect, 3 concern) | yes: "Restore last review-branch rules" agent followed | 957k |
| 8 | ae400e | later | 6 (2 defect, 4 note) | yes: a34c50 fixed=2 | 645k |
| 8 | afae39 | fix-diff | 6 (1 defect, 3 concern, 2 note) | yes: ae309d fixed=4 | 379k |
| 8 | a9c340 | fix-diff | 5 (1 concern, 4 note) | no: run-arm byRole backfill concern left, branch squashed at once | 175k |
| 9 | a3d217 | fix-diff | 0 (CLEAN) | no | 99k |

## Real defects found by these reviews

1. Use 1: scorer dry run priced the wrong variants (generic ladder instead of Decision 1), estimate a third too low; benchmarks/ideate-worker-score.mjs:262.
2. Use 1: documented quick scorer command read a file no documented command wrote; benchmarks/README.md:273.
3. Use 1: loadRuns crashed with ENOENT on a budget-skipped session; benchmarks/ideate-worker-score.mjs:82.
4. Use 2: `--open-slots` output cut with no full log kept; skills/build/scripts/next-task.mjs:390.
5. Use 2: non-chained landing repeated the Landed/Route lines; skills/build/scripts/land-slot.mjs:70.
6. Use 2: restored wait-report dropped the `--timeout` flag; skills/build/scripts/wait-report.mjs:50.
7. Use 2: wait-report input unvalidated at the trust boundary; wait-report.mjs:71.
8. Use 2: trim lost the `BLOCKED input unreadable` case and the rerun count (2 vs 3); agents/task-runner.md:19 and :25.
9. Use 2: every next-task call overwrote one shared log; next-task.mjs:392.
10. Use 2: subagent-start check was vacuous; subagent-start.mjs:11.
11. Use 3: Reads parsing estimated 0 tokens for space-separated, backticked and `#L`/`:L` forms, so over-budget orchestrator dispatches passed the hook (lib/worker-size.mjs:16); Fetches with a unit word or a sign mis-counted (:41). Fixed in later commits, not inside the gate.
12. Use 5: flaky-record repair read one reporter only, TAP output gave no files; lib/flaky-record.mjs:5.
13. Use 6: repair commit added a stray `--save/sources.jsonl`; new unguarded `excludeScratch` in fetch.mjs:40.
14. Use 7: dropped review-branch rules (agents/review-branch.md:16, :28, :38), plus a changed condition at SKILL.md:8 and a plan-forbidden threshold at budgets.mjs:93 (the last two "probable").
15. Use 8: outlier named the wrong cell (flow-report.mjs:64); repair regressed to `run undefined` for records without repeat (flow-report.mjs:66) and a wrong derived value (:35); run-arm byRole backfill source (backfill-usage.mjs:16-37).

About 25 distinct defects across 13 reviews. Items 1 to 3, 6, 9, 12, 13 and 15 are user-visible failures or regressions of the repair itself.

## Totals

| group | reviews | found a real defect | tokens |
|---|---|---|---|
| later round | 11 | 7 | 6.51m (real 4.27m, none 2.24m) |
| fix-diff | 10 | 6 | 4.46m (real 3.87m, none 0.59m) |
| both | 21 | 13 | 10.98m (real 8.14m, none 2.83m) |

- 21 reviews, 13 found a real defect, 8 did not (4 CLEAN, 4 report-only).
- Skipping all 21 saves about 10.98m review tokens, 49% of the 22.3m. Skipping only the 8 that found nothing would have been the efficient cut (2.83m), but that is not knowable in advance.
- Skipping all 21 would have shipped about 25 real defects from 13 reviews, including regressions of the repairs (items 13 and 15). The fix-diff reviews found real defects in 6 of 10 cases.
- A finding review costs 0.63m on average, a non-finding one 0.35m. The clean fix-diff reviews are the cheapest (99k to 175k).

## Caveats

- "Real fix" for uses 2, 3 and 7 rests on timing and message content, not a line-by-line diff: branches were squashed on main, so per-commit history is gone. Use 7 abbbf1 is "probable", use 2 aff5fa duplicates aaf810, use 3 a8e648 was fixed after the gate window.
- A later-round review can re-find a first-round defect that stayed unrepaired; this was not checked per finding, so a few counted defects may be repeats.
- Savings count review tokens only; skipping a round also skips its lead merge and triage turns (not counted).
- Process note: near the end I ran `bash .exo/long-command-*.sh` by mistake (a glob over saved long commands). Bash ran only the first match, an old script of another run, and it printed a failing test and a missing worktree path. `git status` then showed `tests/benchmark-ideate-worker-score.test.mjs` modified; it was not edited by this task and the cause is unverified. The trailing `rm` may have deleted the `.exo/long-command-*.sh` files if the script exited 0; I could not check afterwards because the context limit refused further tools. Check `ls .exo/long-command-*.sh` and `git diff tests/benchmark-ideate-worker-score.test.mjs`.
