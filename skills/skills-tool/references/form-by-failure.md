# Form by failure

The mistake seen in the run without the skill decides the shape of the rule that prevents it. The enemy is a ban aimed at an output-shape problem, which yields more of the unwanted output than saying nothing. The overcorrection is a recipe so detailed it leaves no room for the judgment the case needs.

## Match the mistake to its form

Read that run's transcript and take the first description below that fits; it sets the form.

1. **The model knew the rule and dropped it under pressure.** Write a bright line with a table of the excuses it gave and a red flags section. Example: "No schema change ships without its down migration."
2. **The output had the wrong structure.** Write a recipe listing the output's parts in order, with a slot for each. Example: "An incident note is the impact, then the timeline, then the follow-ups."
3. **One part was missing.** Add a required slot to the template, marked so an empty one stands out. Example: "`Rollback:` names the command that undoes the change; leaving it blank fails."
4. **Right in one situation, wrong in another.** Write a condition on something the model can observe. Example: "When a changed file sits under `migrations/`, read the data reference first."

## Why a ban misfires on a shape problem

- "Do not produce X" keeps X in view, and the model fills the space the ban leaves with X; a recipe fills that space with the right output instead.
- A hedge such as "unless it matters" hands back the decision the rule meant to settle; state the exception as a separate condition the model can check.
- An exemption such as "tables are exempt from this" still dampens the exempt output; restructure so the rule never reaches that output at all.

## Degrees of freedom

- Several good approaches exist: prose stating the goal and the limit, with no steps.
- One approach with settings: a short ladder, or a template with slots.
- A brittle sequence where one wrong step damages state: an exact command or a script the skill runs, never prose the model could reword.

## Judgment

- The form the observed mistake calls for outranks the writer's habit; discipline machinery on a shape problem is a fault.
- An exception written as its own condition outranks a hedge inside the rule.
- The least freedom that still admits every good approach outranks the most detailed form.
