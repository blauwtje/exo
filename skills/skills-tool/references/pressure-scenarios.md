# Pressure scenarios

A skill is tested by the prompt most likely to make the model skip it. The enemy is the academic prompt, which the baseline passes by reciting the rule and so proves nothing. The overcorrection is a scenario so contrived the model treats it as a puzzle instead of a job.

## Which skills need one

- A skill that enforces a discipline the model finds costly (a test first, a proof before a fix, a question before a build): pressure scenarios, at least three.
- A skill that teaches a technique or a pattern: one application case, one variation, one case with a detail missing, and a counter-example where the pattern does not apply.
- A reference: a retrieval case, an application case and a gap case where the answer is not in it; no pressure.

## The seven pressures

Time, sunk cost, authority, money, exhaustion, social, and pragmatism.
One pressure makes a usable case; three combined make a strong one, because a skill that survives one pressure still folds under the second.

## Elements of a scenario

- Concrete options the model must choose between, each plausible, with real file paths, numbers and names.
- A constraint that makes the right option expensive: a deadline, a stakeholder, a passing pipeline, hours already spent.
- A prompt that asks what the model does, not what it should do; advice is free, action is the test.
- No deferral exit: the human is away, the tool budget is fixed, the decision cannot be postponed.
- A preamble stating the scenario is real and the model must choose and act.

## Running the case

1. Run the case without the skill on the model the skill runs on, because a rule Sonnet needs is noise to Opus and the reverse.
2. Record the choice and the rationalization verbatim; the exact wording is the material the skill answers.
3. Run the same case with the skill loaded; a pass counts only when the baseline failed.
4. Save the case under `evals/<skill>/` with the expected behavior stated as an observable, so the next edit can rerun it.

## Judgment

- A case the baseline fails outranks a case that reads well.
- Combined pressures outrank a single pressure when the skill guards a discipline.
- Action outranks advice: a prompt answered with "one should" is rewritten until the model has to act.
