# The question shape

Every question exo puts to the user has one shape, because the user answers it by typing a digit. The enemy is a question the user cannot answer with one digit. The overcorrection is a question where the user has no real choice to make.

A skill reads this file before a message of its asks the user to pick; the core of the shape also stays in the route-skills body, which every session holds.

## The options

1. **Plain lines, no tool.** The options are lines in the reply that end the turn; a structured question tool, a form or a picker is never used.
2. **One option per line**, numbered `1.`, `2.`, `3.` and written `<n>. **<Label>**: <what it does>`, the recommended one as `1. **<Label> (Recommended)**: <what it does>`: a bold label of one to three words, then a few words saying what happens, never why, and never a command, a model or an effort.
3. **The recommended option is number 1** in every question; the next stage's order turns on whether an `exo: context` notice fired this session; stopping or keeping things as they are comes last unless it is the recommended one. Label, marker and clause are in the reply's language, as the language rule under `# Context` in route-skills sets.
4. **Nothing follows the options** except the one model line `## The next stage` allows.
5. **A digit is the answer.** A reply of `1` carries out option 1 at once, with no confirmation question in between.
6. **One question a turn**, or one round of up to four in `define-scope`. Nothing is written, edited or run until the answer arrives, because work done first is work the answer undoes.

## Around the options

- A decision line naming a choice made for the user sits above the options or is dropped; under them it is text following the options.
- A message a rule sends alone ends the turn by itself; the report waits for the turn that finishes the run.

## Judgment

- The user's typed digit outranks any reading of the conversation: option 1 runs at once.
- One clear question outranks a complete one: a second question waits for the next turn, except in a `define-scope` round.
