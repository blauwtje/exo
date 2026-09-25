---
name: tune-metric
description: Use when the user invokes it to push one measured metric toward a target in an unattended keep-or-revert loop. Not for one decided change, which build-change builds, an unproven failure, which find-cause owns, or choosing what to improve, which audit-architecture owns.
argument-hint: "<metric and direction> <target and attempt floor> [harness command] [budget]"
disable-model-invocation: true
---

# Hillclimb

A number counts only when a frozen harness measured it and the regression checks stayed green around it. The enemy is the run that edits its own yardstick, keeps changes it never measured, and calls a lucky sample or a plateau the finish. The overcorrection is a loop so cautious it stops at the first reject or asks the user about every reversible fix, while nobody is there to answer.

## When to use

- The user invokes it with a metric, its direction and a target: latency, bundle size, memory, a score.
- Not for one decided change: `build-change` builds it and needs no loop.
- Not for a failure with an unproven cause: `find-cause` proves it first.
- Not for finding what to improve: `audit-architecture` ranks the candidates.

## The loop

1. **Frame.** Write the metric, its direction and a stop predicate pairing a target with an attempt floor, such as "p95 at most 60% of baseline and at least 10 attempts", so one lucky sample cannot end the run. A budget the user names is the only other end. Locate the hot path with `exo:locate-code`, and pick a case that reproduces the complaint; with none, building one comes first.
2. **Prove the harness, then freeze it.** One command reports the median of at least five runs and their spread. Run it on two workloads that must differ and confirm it separates them beyond the spread, because a harness blind to a known difference is blind to yours. Commit the harness and its inputs; from here nothing edits them or the regression checks.
3. **Baseline.** Open the log as `references/decision-log.md` describes, run the regression checks green, measure, and log the `start` and `baseline` rows.
4. **Hypothesize.** Each attempt is one change naming the mechanism that moves the metric, read from the code step 1 located; "try caching something" names none.
5. **Attempt.** Build each attempt through a `general-purpose` delegate on `sonnet` from `attempt-prompt.md`, in its own worktree off the current best; independent attempts go out in one message. Review the diff, then measure attempts one at a time, because concurrent runs share the machine and skew each other.
6. **Keep or revert.** Keep only when the median moves past the spread in the right direction and the checks stay green; revert everything else in full, since unmeasured changes stacked together hide which one broke what. A kept attempt lands as its one commit on the run branch; one measured against an older best is measured again first. Log one row per attempt either way.
7. **Push past plateaus.** Three rejects in a row are a plateau, not a stop: log a `pivot` row and change category, combine near-misses, or reread the hot path. Stop only when the predicate holds or the budget is spent. Run waits under `/loop`. A broken tool outside the harness is yours to fix in its own commit through `find-cause` or `build-change`. A flaw in the harness or checks ends this run instead; the next run gets a fresh baseline.
8. **Audit and land.** Log the `stop` row, then dispatch a fresh `general-purpose` delegate from `auditor-prompt.md` on another model: `opus` from a `sonnet` session, `sonnet` otherwise, because a model auditing its own run shares its blind spots. Correct the log only with `supersede` rows, then land through `ship`. Report the metric and target, baseline to final with its % change, attempts kept and reverted, one line per kept change, the log path, the best untried idea, and the auditor's attention list verbatim.

## References

| File | Read it when |
|---|---|
| `references/decision-log.md` | Step 3, before the first row, and whenever a row is written or corrected. |
| `attempt-prompt.md` | Step 5, for each attempt dispatched. |
| `auditor-prompt.md` | Step 8, after the `stop` row. |

## Judgment

- A green regression check outranks any gain: a win that breaks behavior is reverted, and a simplification that holds the metric within spread is kept.
- A measured median outranks a reasoned one: a win read from the code is not a win.
- The frozen harness outranks a better way to measure: that idea waits for the next run.
- The predicate as written outranks a close result: report the miss, never loosen the target or the floor.
- Continuing outranks asking: only an irreversible action, a product call or a dead end every category has hit goes to the user.
