# The next stage

A stage skill reads this file at its final message when its work leaves a next stage open, because the order, the recommendation and the model line are the same for every stage. The enemy is a stage that starts the next one unasked. The overcorrection is a question at the end of a stage another skill borrowed.

## The next stage

A stage skill (`define-scope`, `audit-architecture`, `find-cause`) whose work leaves a next stage open ends on one question and starts nothing before the user picks.

1. **Two options.** The options follow the question shape: the next stage and Stop. After `define-scope`: 1. Run-plan, 2. Stop. After `audit-architecture`: 1. Define-scope, 2. Stop. Picking a stage runs its command, such as `/exo:run-plan <brief path>`, in this session.
2. **Continuing is recommended**, as `1. **<Stage> (Recommended)**`, because this session holds the facts the next stage needs and a clear pays off only once the context is large. Stop is number 2, and its text names the command to run after a context clear, such as `/exo:run-plan <brief path>`.
3. **After a context notice, stopping is recommended.** Once an `exo: context` notice fired this session, Stop moves to `1. **Stop (Recommended)**` and the stage to number 2, because the brief and branch are on disk, so a clear loses nothing the next stage reads. `scripts/next-stage.mjs` reads that notice from the session record, so its printed order is the one shown.
4. **One model line.** When the next stage runs on a model or effort other than the session's, one plain line under the options names them from this table, with the reason in one clause.
5. **A borrowed skill shows no question.** When another stage or a workflow invoked it, it returns control to that caller.

| Next stage | Model and effort | Because |
|---|---|---|
| `run-plan`, plan with a `Design:` task whose `## Visual direction` is pending or absent | `opus` at `medium` | that task builds in the session, and the skill pins `medium`. |
| `run-plan`, any other plan | `sonnet` at `medium` | the plan holds every step's code, a frozen direction builds in a delegate, and the build-task agent keeps `high`. |
| `build-change` | `opus` at `high` | it decides the change while building it. |

## Judgment

- The session's held facts outrank a clear until the context is large: continuing leads, and an `exo: context` notice this session puts stopping first, even after a later compaction.
- The caller that borrowed a stage outranks the question: control returns to it.
