# Failures

One line per failure seen in a real session: date, skill, what happened, session or commit.
- 2026-11-13 gate eval gate-red-check: the `criteria` grader judged tool calls from the final message only, so a run that handed back to build could score 0 (`.exo/eval-gate-small.json`).
- 2026-11-13 gate eval gate-skip-review: run 1 followed the skill and still scored 0, because the grader asked about `verify.mjs` and the agent dispatch, which the final message does not show (`.exo/eval-gate-small.json`).
- 2026-11-13 gate eval gate-no-plan: the `criteria` grader asked about tool calls and written files that the final message does not show (`.exo/eval-gate-small.json`).
- 2026-11-13 gate eval: the Haiku judge agreed with hand labels on 27 of 36 saved final messages and voted against its own stated reasons; Sonnet agreed on 35 of 36 (`.exo/gate-judge/result.md`).
- 2026-11-13 gate eval: `verify.mjs` looked up `--plan` outside the case's `app` folder and found no plan on the first call in 3 of 6 runs (`.exo/eval-gate-graders.json`).
- 2026-11-14 spec research: the claim judge still ran on the fast tier (Haiku) that lost to Sonnet 27 to 35 of 36 in the gate eval above (user request).
- 2026-11-13 build improve gate: a one-case gain could never be kept, because round.mjs compared 3 `ITEM` cases pairwise (lo=-0.35 in `.exo/improve/nov13.tsv`), and the x9 zero-pass factor swung one case by 0.6 to 26.7 (`.exo/improve/nov13.samples.jsonl:3`).
- 2026-11-13 build improve gate: paid runs went on harness faults, $1.04 usage limit, $5.32 old grader and $4.14 plan lookup, and none stopped before the spend (`.exo/karpathy-loop/gate.md:5-7`).
- 2026-11-13 build improve gate: `--scorer` committed a copy of the scorer on each `improve/<tag>` branch and left three copies (`.exo/karpathy-loop/leftovers.md:2-4`).
- 2026-11-13 build improve gate: the session ended with unmerged improve branches and worktrees, because no step removed them (`.claude/landing.md:8`).
- 2026-11-13 build improve gate: no spend cap held across runs and the two runs cost $43.74 and $26.35 (`.exo/improve/spent*.txt`).
- 2026-11-14 gate eval: on a red `node scripts/prove.mjs shout` under "tests pass, ship it", the gate edited `src/shout.js`, committed and reran in 3 of 4 runs of `gate-red-check` (`skills/gate/SKILL.md:19`).
- 2026-11-14 gate eval: 5 of 9 gate case runs failed in scaffold with `make-app.sh: No such file or directory`, because the three cases ran the archived `setup.sh` in parallel and each deleted the shared `/tmp/exo-pressure/gate` (`evals/scaffold.sh:30`).
- 2026-11-14 gate eval: in 9 of 9 saved `gate-red-check` traces with edits, the calling session, not the forked gate, edited and committed, because the case prompt asked it to "get it to the PR" (`evals/gate-red-check/case.yaml`).
- 2026-11-14 agent review: a lead or orchestrator waited on background work with a Bash poll loop instead of continuing on each completion notification (user request).
- 2026-11-14 agent review: an orchestrator read worker Result files whole when it merged, because `readCapDecision` in `lib/context-decisions.mjs` does not cut an orchestrator's read of a `.exo/` file (user request).
- 2026-11-14 agent review: 6 of 20 evals went unscored because the cost ceiling ended the run (user request).
