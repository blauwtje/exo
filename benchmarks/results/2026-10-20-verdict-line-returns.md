# Agent returns as one verdict line plus a report path

Tested on 2026-10-20 as a $0 offline replay of recorded real-use transcripts. Scripts, prereg and notes are local and untracked in the main checkout under `.exo/self-improve/s6/`.


Scripts: tests/g3-replay.mjs (extract; raw output tests/g3-raw.json), tests/g3-an.mjs (distribution), tests/g3-sim.mjs (replay, env MODE/TYPES/CAT/CPT).
Prereg: r2-test-G3-prereg.md (written before any outcome data). Corpus: 260 "other projects" run sessions, $957 total (exo repo 1317 runs, $2,940, secondary).

## Findings
1. Already landed for most of the knob. Current agents/run-unit.md "Return" = one line per task, build-task `Return: one line`,
   review-branch `verdict=... report=<path>`. In the corpus 74 of 82 run-unit notifications and 142 of 144 build-task notifications
   already start with a verdict token (LANDED/BLOCKED/Task n: GREEN). Replacing them with 30 tokens just reproduces the existing grammar.
2. Most of the "1.73% agent notification + Agent result" bucket is not controllable by return sections:
   - Agent tool_result for background dispatches is harness boilerplate "Async agent launched successfully ..." (~1,090 chars each, 700+ in corpus).
   - 489 of ~1,000 notifications are plain Bash background notifications (~680 chars; W idea, not G3).
   - Free-text notifications come from general-purpose (avg 2,021 chars), fetch-docs, locate-code, find-open-points: not run-unit/fix-review/solve-hard.
3. Residual targets (types run-unit, fix-review, solve-hard; notification >200 chars, not verdict-form): 35 in other, 31 in exorepo.

## Replay numbers (CPT 2.17; carry = 1 write + reads to run end; lead cost as share of run total)
| scenario (other, residual) | pooled saving | 95% bootstrap CI |
|---|---|---|
| gross carry removed | 0.024% | [0.012, 0.038] |
| net: minus writer-side report file cost, lead reads BLOCKED/FAIL reports | -0.020% | [-0.033, -0.009] |
| net: lead also reads 10% of good reports | -0.022% | [-0.036, -0.011] |
| net: lead reads every report | -0.044% | [-0.068, -0.023] |
Upper bounds: all >200-char notifications of the three types (incl. already verdict-form) gross 0.066%, net -0.044%;
all exo agent types gross 0.119%, net -0.094%; every notification of every type incl. Bash and general-purpose gross 0.54% [0.46, 0.63], net -0.19%.
Exo repo residual: gross 0.007%, net -0.006%.
Wake-turn output: OLS slope of lead output tokens on notification chars = +0.25 tok/char (n=405, mean output 301 tok), so shorter
returns would shave about 250 output tokens per removed 1,000 chars; on 35 residual targets that is about $0.2 (0.02% of run), even the all-notification ceiling is about 0.5%.
Even with free overhead, the ceiling of gross carry plus wake over every notification type is about 1%, and the exo-agent share is under 0.2%.

## Verdict
Threshold (pooled net >= 1.0% of run cost, CI lower bound > 0) missed by a factor of 50 or more; net is negative once the report file write and
the lead's later read are charged. Stop rule met: no paid arm, no worktree `verdict-line-returns`, no branch.
Honest pricing note: the "lead must later read the report" cost is what flips net negative; gross is already under 0.1%.
Wrong-premise note: the gate bucket (1.73%) mixes harness launch metadata and Bash notifications into "agent returns"; the R2 gate should not re-queue return-grammar ideas for run-unit/build-task/review-branch.
Paid spend: $0.00 of $4.75.
