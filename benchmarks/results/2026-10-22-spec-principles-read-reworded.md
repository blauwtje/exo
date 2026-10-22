# Spec opens the principle pages on an agent-design case, reworded trigger (idea 12, rerun)

Tested on 2026-10-22: same case as `benchmarks/results/2026-10-22-spec-principles-read.md`, `benchmarks/pressure/spec/a-deepseek-worker.txt`, driven multi-turn by `node benchmarks/pressure/drive.mjs A sonnet with --label rw<n> --plugin-dir <worktree>` (Sonnet, effort high), 3 runs of the `with` arm, each from a fresh `benchmarks/pressure/spec/setup.sh` fixture. Plugin loaded from branch `s5-reword` (`main` e24fc587 plus the reworded row at `skills/spec/SKILL.md:53`).

Changed row: `Agents, tools, context or run-loop shapes compete.` became `Request adds or changes an AI agent or LLM worker, its prompt, tools or loop.`

Criterion (`benchmarks/pressure/spec/criteria.md`): the transcript holds a `Read` of `docs/principles/README.md`, graded with its `grade: run` command in each run folder `/tmp/exo-pressure/runs/A-sonnet-with-rw<n>/`.

## Result

| Run | Turns | Cost (sum of turn `total_cost_usd`) | Read of `docs/principles/README.md` | Also read |
|---|---|---|---|---|
| rw1 | 5 | $0.72 | yes | `docs/principles/agent.md`, `build/references/security.md` |
| rw2 | 5 | $0.93 | yes | `build/references/run-loop.md`, `build/references/workspace.md` |
| rw3 | 5 | $0.68 | yes | `docs/principles/agent.md` |

Pass rate 3/3. Total cost $2.33.

## Before and after

| Row wording | Runs that opened `docs/principles/README.md` |
|---|---|
| Before: `Agents, tools, context or run-loop shapes compete.` | 0/3 ($2.28) |
| After: `Request adds or changes an AI agent or LLM worker, its prompt, tools or loop.` (commit 3f78f567, spec body 789 tokens, over the 783 cap) | 3/3 ($2.33) |
| Shortened to fit the cap: `Builds or changes an AI agent: prompt, tools, loop.` (spec body 783 tokens, passes `validate:static` body budget) | 0/3 ($2.46) |

## Rerun with the shortened row (fits the body cap)

Same case, command and criterion as above, labels `rx1` to `rx3`, plugin loaded from branch `s5-reword` with the row at `skills/spec/SKILL.md:53` reading `Builds or changes an AI agent: prompt, tools, loop.` Longer candidates (`Request builds or changes an AI agent, its prompt, tools or loop.` and four others) measured 784 to 786 tokens, over the cap.

| Run | Turns | Cost | Read of `docs/principles/README.md` | Also read |
|---|---|---|---|---|
| rx1 | 5 | $0.79 | no | `src/workers/*.py`, `src/main.py`, `src/config.py`, spec references |
| rx2 | 5 | $0.88 | no | spec references |
| rx3 | 5 | $0.79 | no | spec references |

Pass rate 0/3. Total cost $2.46. The shortened row does not fire; the 3/3 above holds only for the 789-token wording.

## Caveats

- Only the `with` arm ran, as in the earlier result.
- The judge lines of the spec criteria were not graded; this answers the principle-page question only.
- `drive.mjs` sends `1` as its scripted reply for case A. `criteria.md` says `a`.
- One case, n = 3: the wording fires on this case; it is not shown not to fire on unrelated requests.
- `npm run validate:static` on this branch ends `FAIL=1`: `skills/spec/SKILL.md` body is 789 tokens, over its 783-token ceiling (`verify/budgets.mjs:77`); the new row is longer than the old one.

## Verdict

Rerun with the shortened row: FAIL, 0 of 3. The earlier verdict below stays true for the longer wording only.

PASS on the principle-page question: the reworded trigger fires in 3 of 3 runs where the old one fired in 0 of 3. The row stays; the spec body needs 6 tokens of room or a ceiling decision.

Decision: the long 3/3 wording ships, with the spec body cap raised 783 -> 790 (the body measures 789.25 tokens), because the only wording under 783 scored 0/3.
