# The next stage

A stage skill reads this file at its final message when its work leaves a next stage open, because the order, the recommendation and the model line are the same for every stage. The enemy is a stage that starts the next one unasked. The overcorrection is a question at the end of a stage another skill borrowed.

## The next stage

A stage skill (`shaping`, `planning`, `deepen`, `debug`) whose work leaves a next stage open ends on one question and starts nothing before the user picks.

1. **Fixed order.** The options follow the question shape. After `shaping`: 1. Planning, 2. Stop. After `planning`: 1. Implementing, 2. Stop. Another stage skill lists the stages it opens in that order, stopping last; picking an option runs its command, such as `/exo:planning <spec>`, in this session.
2. **This session is recommended**, because it already holds the facts. When a compaction notice has appeared in this session or this stage is the second to finish in it, stopping is recommended instead: it moves to number 1 with `(Recommended)`, the stages keep their order below it, and its text names the command to run after a context clear.
3. **One model line.** When the recommended stage runs on a model or effort other than the session's, one plain line under the options names them from this table, with the reason in one clause.
4. **A borrowed skill shows no question.** When another stage or a workflow invoked it, it returns control to that caller.

| Next stage | Model and effort | Because |
|---|---|---|
| `planning` | `opus` at `high` | a plan's code is pasted as written, so a slip repeats in every task. |
| `implementing`, plan with a `Design:` task whose `## Visual direction` is pending or absent | `opus` at `high` | that task builds in the session. |
| `implementing`, any other plan | `sonnet` at `high` | the plan holds every step's code, and a frozen direction builds in a delegate. |
| `implementing-batch` | `opus` at `high` | it decides the change while building it. |

## Judgment

- A compaction notice or a second finished stage outranks the session's held facts: stopping becomes the recommended option.
- The caller that borrowed a stage outranks the question: control returns to it.
