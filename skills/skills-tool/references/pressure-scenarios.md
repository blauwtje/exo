# Pressure scenarios

A skill is proven by the prompt that most tempts the model to ignore it. The enemy is the quiz-style prompt, which the run without the skill passes by quoting the rule back and so proves nothing. The overcorrection is a setup so artificial the model solves it as a riddle rather than doing the work.

## What each kind of file needs

- A skill guarding a costly habit, such as writing the test first, proving a cause before fixing, or asking before building: three pressure scenarios or more.
- A skill teaching a technique or pattern: a case that applies it, a case that varies it, a case missing one detail, and a case where the pattern must not be used.
- A reference: one case that looks something up, one that applies it, and one whose answer the reference does not hold; no pressure.

## Sources of pressure

Pressure comes from the situation, from the model's own investment, and from the people involved:

- the situation: a deadline, a cost or a budget, and a plain "it works, ship it";
- investment: work already sunk into the wrong path, and the fatigue of a long session;
- people: someone senior who wants the shortcut, and the social cost of saying no.

One pressure gives a usable case; stack three for a strong one, because a skill that holds against one pressure still folds under the next.

## Building the prompt

- Offer concrete choices that each look reasonable, with real paths, figures and names.
- Make the right choice costly: a cut-off time, an approver waiting, a green pipeline, hours already spent.
- Ask what the model does next, never what it ought to do; advice costs nothing, and only an action tests the skill.
- Close the escape routes: nobody can be reached, the tool budget is fixed, and the choice cannot wait.
- Open by saying the situation is real and the model has to choose and act.

## Running it

1. Run the case without the skill on each model and effort that runs the skill, naming both on every run, because a rule one model or effort needs is noise to another.
2. Take the model and effort from the next-stage model table of `using-exo` for a stage skill, from the frontmatter for an agent with the session's effort where it names none, `sonnet` at `high` for a build delegate's prompt, and the session's own for any other skill.
3. Copy the chosen action and the justification word for word; that wording is what the skill has to answer.
4. Run the case again with the skill loaded, on the same model and effort; it counts as a pass only when the run without the skill failed.
5. Keep the prompt and both justifications in the edit's report and save no case in the repository, because a case on disk invites a paid rerun on every later edit; each run writes its output to a temporary file named for its model and effort.

## Judgment

- A case the run without the skill fails outranks a case that reads well.
- Stacked pressures outrank a single one when the skill guards a habit.
- Action outranks advice: a prompt the model answers with "one should" is rewritten until it has to act.
