# Spec opens the principle pages on an agent-design case (idea 12)

Tested on 2026-10-22: case `benchmarks/pressure/spec/a-deepseek-worker.txt`, driven multi-turn by `node benchmarks/pressure/drive.mjs A sonnet with --label run<n>` (Sonnet, effort high), 3 runs of the `with` arm, each from a fresh `benchmarks/pressure/spec/setup.sh` fixture. Plugin loaded from branch `idea-12` (same as `main` 458684bb plus the criteria line).

Criterion (`benchmarks/pressure/spec/criteria.md`, `a-deepseek-worker.txt`): the transcript holds a `Read` of `docs/principles/README.md`, graded with its `grade: run` command in each run folder `/tmp/exo-pressure/runs/A-sonnet-with-run<n>/`.

## Result

| Run | Turns | Cost (sum of turn `total_cost_usd`) | Read of `docs/principles/README.md` |
|---|---|---|---|
| run1 | 5 | $0.95 | no |
| run2 | 5 | $0.76 | no |
| run3 | 5 | $0.57 | no |

Pass rate 0/3 (Wilson 95% CI 0 to 0.56). Total cost $2.28.

## Evidence

- The pointer row was in context in every run: each `turn1.jsonl` holds the loaded spec body with `` `../../docs/principles/README.md` | Agents, tools, context or run-loop shapes compete. ``
- Run 1 opened the row just above it, `skills/spec/references/architecture-sketch.md` ("Two or more structural shapes compete"), but not the principles page. Runs 2 and 3 opened neither.
- Every run asked about the worker's agent shape: whether it edits files, returns a patch or only answers; where it edits; which commands it may run. These are tool and run-loop choices, but the model framed them as user-facing behavior questions. So the trigger "shapes compete" never fired, even though the request is to design an AI coding worker.
- Reads in all runs: `route-skills/references/question.md`, then `spec/references/brief.md`, `task-list.md`, `example-plan.md`, `hand-off.md`, plus `fetch-docs` (runs 1 and 2) and `find-open-points` dispatches. Run 1 also read `build/references/security.md`.

## Caveats

- Only the `with` arm ran. A no-exo arm cannot read an exo page, so it would score 0/3 by construction and add no information.
- The judge lines of the spec criteria were not graded. This run answers the principle-page question only; it is not a full pressure check of the reworded spec body.
- `drive.mjs` sends `1` as its scripted reply for case A. `criteria.md` says `a`.

## Verdict

FAIL. Spec does not open the principle pages on the one agent-design case: 0/3, and the pointer was loaded in every run. Likely fix: rewrite the trigger at `skills/spec/SKILL.md:53` as a content cue the model recognises from the request, such as "The request adds or changes an AI agent, LLM worker, prompt or tool loop.", then rerun this case. Otherwise drop the pointer.
