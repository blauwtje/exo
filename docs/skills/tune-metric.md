# tune-metric

Improves one measured metric in an unattended loop: each change is measured against a frozen harness, then kept or reverted, until a target and a minimum number of attempts both hold.

## When it fires

Only when you invoke it. Claude never starts it, because only you can name the metric, the target and how long the run may go. A single decided change belongs to build-change, a failure with an unproven cause to find-cause, and finding what to improve to audit-architecture.

## What you get

- A harness proven to tell two different workloads apart, then frozen: nothing edits it or the regression checks during the run.
- One change per attempt, measured as the median of several runs with the regression checks green before and after; a change that does not beat the noise is reverted in full.
- A stop rule that pairs the target with an attempt floor and is never loosened; a plateau changes approach instead of ending the run.
- An append-only log with one row per attempt, audited at the end by a reviewer on another model against the run's commits, saved outputs and transcript.
- A report with baseline to final, attempts kept and reverted, the log path, the best untried idea, and the reviewer's attention list.

## Where its rules live

`skills/tune-metric/SKILL.md`, with `references/decision-log.md`, `attempt-prompt.md` and `auditor-prompt.md`.
