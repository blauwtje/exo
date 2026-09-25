---
name: run-parallel
description: Use when the user invokes it to fan one job out to parallel workers for split coverage, a race, a gauntlet of checks, or an arena of rubric-judged candidates. Not for a plan's tasks, which run-plan runs in waves, or one lookup, which exo:locate-code answers.
argument-hint: "<coverage|race|gauntlet|arena> <done predicate or artifact> [N]"
disable-model-invocation: true
---

# Swarm

Parallel workers are only worth their cost when every rule that judges them is fixed before the first one runs. The enemy is the run that decides what counts as winning after reading the results, so the pick bends to whichever output looks familiar. The overcorrection is a swarm for work one delegate could do, which buys N reports and a merge for no gain in coverage.

## When to use

- The user invokes it with a shape: coverage splits a scope into slices, race runs one brief N times, gauntlet runs N distinct checks against one artifact, arena has N candidates build the same thing.
- Not for a plan's tasks: `run-plan` fans those out in waves.
- Not for one read-only lookup: the `exo:locate-code` agent answers it.

## The run

Each delegate brief follows the delegation contract of the user's `CLAUDE.md` and the reader budget in route-skills; this skill adds only what N workers need.

1. **Frame.** Before any spawn, write `<git dir>/exo/swarm/<slug>/frame.md`: the done predicate, the shape, N, and each worker's slice, arm or check with its own output path. A rule written after results exist bends to them.
2. **Fix the judge.** Also in `<git dir>/exo/swarm/<slug>/frame.md`: a race names `first pass`, `rank all` or `best-of`; a gauntlet passes only when every check passes; an arena gets 3 to 6 gradeable criteria for what success means for this artifact. The rubric never enters a candidate brief, because a candidate that sees it writes to the grader.
3. **Disjoint scopes.** No two workers share a slice or a writable path: code goes to a worktree each, made as `../run-plan/references/wave-worktrees.md` makes one, and prose to a file each. A brief that measures names the exact SHAs and the method (sample count, one sample, order), or two numbers cannot be compared.
4. **Fan out.** Send all N in one message, in the background, each a `general-purpose` delegate on `sonnet` from `worker-prompt.md`. Every worker writes its full detail to its file and returns a short verdict line. A dropout leaves N-1, noted in the report.
5. **Aggregate.** A result missing its named SHAs or method reruns once; a second miss is a gap, and a gap never counts as a pass. Coverage needs a result for every slice; race and gauntlet apply the rule from `<git dir>/exo/swarm/<slug>/frame.md`. Coverage, race and gauntlet end here at step 8.
6. **Judge the arena.** Only once every candidate has finished, dispatch one read-only `general-purpose` delegate on `opus` from `judge-prompt.md`; candidates set to `opus` get a `sonnet` judge, because a judge favors its own model's style. Meanwhile read every candidate end to end yourself and score it criterion by criterion. Where your pick and the judge's differ, read both rationales: one of you is biased or the rubric was ambiguous.
7. **Pick and graft.** The top score is the base; a tie goes to the base a maintainer can extend without breaking its invariants. Walk each other candidate once and fold in the one or two parts worth taking by hand, so the result keeps one design. Candidates that all converge ship as they are; candidates that diverge widely mean the frame was underspecified, so reframe and rerun rather than average them.
8. **Verify and report.** Check the grafted artifact as hard as any other change; a failure means the frame was wrong (reframe) or a graft dropped what a candidate caught (back to step 7). The report is a table with one row per worker, evidenced one-line issues, gaps and dropouts, and the rule applied; an arena adds base, grafts with their source, rejections and the verification result. No raw worker output enters it.

## References

| File | Read it when |
|---|---|
| `worker-prompt.md` | Step 4, filling one brief per worker or candidate. |
| `judge-prompt.md` | Step 6, dispatching the arena judge. |

## Judgment

- A rule in `<git dir>/exo/swarm/<slug>/frame.md` outranks what the results suggest: a rule that looks wrong afterwards means a reframe and a rerun, never a quiet swap.
- Your own full reading outranks the judge's scores; the judge is the check on your bias, not the decision.
- Reframing outranks averaging: a blend of divergent candidates is a design nobody made.
- A gap reported as a gap outranks a coverage table that looks complete.
