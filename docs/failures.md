# Failures

One line per failure seen in a real session: date, skill, what happened, session or commit.
- 2026-11-13 gate eval gate-red-check: the `criteria` grader judged tool calls from the final message only, so a run that handed back to build could score 0 (`.exo/eval-gate-small.json`).
- 2026-11-13 gate eval gate-skip-review: run 1 followed the skill and still scored 0, because the grader asked about `verify.mjs` and the agent dispatch, which the final message does not show (`.exo/eval-gate-small.json`).
- 2026-11-13 gate eval gate-no-plan: the `criteria` grader asked about tool calls and written files that the final message does not show (`.exo/eval-gate-small.json`).
- 2026-11-13 gate eval: the Haiku judge agreed with hand labels on 27 of 36 saved final messages and voted against its own stated reasons; Sonnet agreed on 35 of 36 (`.exo/gate-judge/result.md`).
- 2026-11-13 gate eval: `verify.mjs` looked up `--plan` outside the case's `app` folder and found no plan on the first call in 3 of 6 runs (`.exo/eval-gate-graders.json`).
- 2026-11-14 spec research: the claim judge still ran on the fast tier (Haiku) that lost to Sonnet 27 to 35 of 36 in the gate eval above (user request).
