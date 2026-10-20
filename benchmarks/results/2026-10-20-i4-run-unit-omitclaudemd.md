# run-unit `omitClaudeMd` (I4), real-use model

98 post-2026-10-09 run-units (49 sessions, $22.59): dropping the CLAUDE.md attachment from run-unit saves 4.83% of run-unit cost (bootstrap 95% CI 4.15 - 5.79, over sessions). Current-prompt subset (47 units): 4.86% (3.72 - 6.87). Outside the exo repo (33 units): 3.75% (2.75 - 4.95).

Model: attachment tokens (chars / 3.5) x (one 1h cache write + a cache read on every later request) at the model the unit ran. The `Agent(type)` allowlist was probed and removed: it neither blocked a dispatch nor shrank the agent listing in a plugin sub-agent. A probe confirmed `omitClaudeMd` drops the `instructions` attachment from a plugin agent.


## Paid guard (flow-unit, n=1)

Preregistered guard: one flow-unit run lands every task as the baseline, with no refusal from the `exo:build-task` allowlist, at cost <= $0.60. The run used the I4 worktree (`perf/i4-run-unit-diet`, commit `c7c10a25`), and the transcript shows the plugin loaded from that worktree's `skills/` path, not the main checkout.

- Cost $0.595 against a $0.60 limit and a $0.598 baseline (mean of 15 runs, sd 0.075).
- 4 of 4 tasks landed (baseline 60 of 60), hidden check passed, 0 drift reports, exit 0, wall 169.6 s (baseline mean 136.6 s, sd 25.4).
- No refusal: run-unit dispatched only `exo:build-task`; no "not allowed" tool result in the lead or any subagent transcript.
- Guard: PASS. With n=1 and a baseline sd of 0.075 it shows the guard met, not a lower cost.
