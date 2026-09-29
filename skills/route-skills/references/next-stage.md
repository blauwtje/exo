# The next stage

A stage skill reads this file at its final message when its work leaves a next stage open, because the order, the recommendation and the model line are the same for every stage. The enemy is a stage that starts the next one unasked. The overcorrection is a question at the end of a stage another skill borrowed.

## The next stage

A stage skill (`spec`, `find-cause`) whose work leaves a next stage open ends on one question and starts nothing before the user picks.

1. **Two options.** The options follow the question shape: the next stage and Stop. After `spec`: 1. Build, 2. Stop. Picking a stage runs its command, such as `/exo:build <brief path>`, in this session.
2. **Continuing is recommended**, as `1. **<Stage> (Recommended)**`, because this session holds the facts the next stage needs and a clear pays off only once the context is large. Stop is number 2, and its text names the command to run after a context clear, such as `/exo:build <brief path>`.
3. **A context notice changes nothing here.** Past an `exo: context` notice the session keeps the order above and hands the work on through a fresh delegate, so Build stays `1.` and Stop stays `2.`.
4. **One model line.** When the next stage runs on a model or effort other than the session's, one plain line under the options names them from this table, with the reason in one clause. `scripts/next-stage.mjs` reads the model and effort of the last two rows from the `coordinate` and `hardest` kinds in `lib/model-kinds.json`; the first row stays literal.
5. **A borrowed skill shows no question.** When another stage or a workflow invoked it, it returns control to that caller.

| Next stage | Model and effort | Because |
|---|---|---|
| `build`, plan with a `Design:` task whose `## Visual direction` is pending or absent | the session's model at `medium` | that task builds in the session, and the skill pins `medium`. |
| `build`, any other plan | `sonnet` at `medium` | each task names its files, data and proof, and the build-task agent keeps `high`. |
| `build`, no plan (a decided change) | `opus` at `max` | it decides the change while building it. |

## Judgment

- The session's held facts outrank a clear until the context is large: continuing leads, even past an `exo: context` notice.
- The caller that borrowed a stage outranks the question: control returns to it.
