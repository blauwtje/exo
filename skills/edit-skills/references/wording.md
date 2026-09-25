# Wording

A rule binds when it is a bright line the model can check, stated with the authority the failure warrants. The enemy is the hedge, which the model reads as permission. The overcorrection is command language on a judgment call, which the model follows literally past the boundary the reason would have drawn.

## Register by skill kind

| Skill kind | Register | Why |
|---|---|---|
| Discipline (a step the model is tempted to skip) | Imperative, "no exceptions", a forced choice, one line the model states before acting | A bright line cuts rationalization; a stated commitment is kept |
| Technique or stage | Moderate imperative plus the reason; colleague voice | The reason lets the model draw the boundary itself |
| Reference | Plain statements | Nothing to enforce |

Never flatter the model or thank it in a skill: warmth trains sycophancy toward the skill's own text.
Urgency belongs only where the failure is immediate; a false "before proceeding" on a low-stakes step teaches the model to ignore the true one.

## Sentences that bind

- "When X, do Y" with X observable beats general advice; the model executes the trigger without deciding.
- One term per concept across the skill; a synonym reads as a second concept.
- A default with one named escape hatch beats a menu of options; the model picks the default and moves.
- Nothing dated: no "the new API", no "as of this version"; a fact that will age goes to a reference with its date.
- Point to `--help` or the existing skill instead of restating flags or another skill's steps.

## Micro-test wording

Before a full scenario, test a sentence in isolation when two phrasings compete:

1. Same realistic prompt, fresh context per call, one arm per phrasing and a control arm with no guidance.
2. If the control arm does not fail, the sentence is cut; there is nothing to fix.
3. Five runs per arm at least; read every flagged output by eye, a grep match is not a judgment.
4. Variance across runs is the signal: a phrasing that binds converges, one that does not scatters.

A micro-test settles wording, never whether the skill holds under pressure; that is the scenario's job.

## Judgment

- The reason clause outranks the imperative on a technique; the imperative outranks the reason on a discipline.
- A default with an escape hatch outranks a list of options.
- Convergence across runs outranks the author's preference between two phrasings.
