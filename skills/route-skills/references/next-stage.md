# The next stage

A stage skill reads this file at its final message when its work leaves a next stage open, because the order, the recommendation and the model line are the same for every stage. The enemy is a stage that starts the next one unasked. The overcorrection is a question at the end of a stage another skill borrowed.

## The next stage

A stage skill (`spec`, `find-cause`) whose work leaves a next stage open ends on one question and starts nothing before the user picks.

1. **One lettered pick.** The question follows the question shape as a single pick titled `**1 · Next step**`. After `spec`: A Adjust the brief, B Build here. After `find-cause`: A Build, B Stop. B after `spec` runs `/exo:build <brief path>` in this session.
2. **A is the recommended option**, as `→ A. <reason>`, and the line for no answer follows it: nothing starts, and `/clear` then `/exo:build <brief path>` builds in a fresh session.
3. **A context notice changes nothing here.** Past an `exo: context` notice the session keeps the letters above and hands the work on through a fresh delegate.
4. **One model line.** When the next stage runs on a model or effort other than the session's, one plain line under the question names them from this table, with the reason in one clause. `scripts/next-stage.mjs` reads the model and effort of each row from the kinds in `lib/model-kinds.json`: the first row's effort from the `build` skill's kind, the last two from the stage kinds.
5. **A borrowed skill shows no question.** When another stage or a workflow invoked it, it returns control to that caller.

| Next stage | Model and effort | Because |
|---|---|---|
| `build`, plan with a `Design:` task whose `## Visual direction` is pending or absent | the session's model at the `build` skill's effort | that task builds in the session, and the skill pins that effort. |
| `build`, any other plan | `sonnet` at `medium` | each task names its files, data and proof, and the build-task agent keeps `high`. |
| `build`, no plan (a decided change) | `opus` at `max` | it decides the change while building it. |

## Judgment

- The session's held facts outrank a clear until the context is large: continuing leads, even past an `exo: context` notice.
- The caller that borrowed a stage outranks the question: control returns to it.
