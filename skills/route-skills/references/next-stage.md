# The next stage

A stage skill reads this file at its final message when its work leaves a next stage open, because the order, the recommendation and the model line are the same for every stage. The enemy is a stage that starts the next one unasked. The overcorrection is a question at the end of a stage another skill borrowed.

## The next stage

A stage skill (`define-scope`, `draft-plan`, `audit-architecture`, `find-cause`) whose work leaves a next stage open ends on one question and starts nothing before the user picks.

1. **Fixed order.** The options follow the question shape. After `define-scope`: 1. Stop, 2. Planning. After `draft-plan`: 1. Stop, 2. Implementing. Another stage skill lists Stop first, then the stages it opens in the order they run; picking a stage runs its command, such as `/exo:draft-plan <spec>`, in this session.
2. **Stopping is recommended**, as `1. **Stop (Recommended)**` whose text names the command to run after a context clear, such as `/exo:run-plan <plan path>`, because the brief, plan and branch are on disk by the skills' own rules, so a clear loses nothing the next stage reads and drops every turn that produced them. This session is number 2: it holds the facts, and pays for them on every turn that follows.
3. **One model line.** When the next stage runs on a model or effort other than the session's, one plain line under the options names them from this table, with the reason in one clause.
4. **A borrowed skill shows no question.** When another stage or a workflow invoked it, it returns control to that caller.

| Next stage | Model and effort | Because |
|---|---|---|
| `draft-plan` | `opus` at `high` | a plan's code is pasted as written, so a slip repeats in every task. |
| `run-plan`, plan with a `Design:` task whose `## Visual direction` is pending or absent | `opus` at `medium` | that task builds in the session, and the skill pins `medium`. |
| `run-plan`, any other plan | `sonnet` at `medium` | the plan holds every step's code, a frozen direction builds in a delegate, and the build-task agent keeps `high`. |
| `build-change` | `opus` at `high` | it decides the change while building it. |

## Judgment

- The artifact on disk outranks the session's held facts: stopping leads after every stage, and a compaction notice changes nothing about the order.
- The caller that borrowed a stage outranks the question: control returns to it.
