# Description

A description tells the model when to load the skill, so write the moment it fires and leave the workflow to the body.

## Contents, in order

1. The moment it fires: request shape, symptom or repository state, in the third person, opening "Use when".
2. The words the model would have in mind then: error text, a tool name, the user's synonym. A trigger the model cannot match never fires.
3. After the skill has been through the loop, the "about to violate" tell: the thought that precedes the failure, phrased as the model thinks it.
4. The "Not for" cases, each naming the owner.

## Keep out

- Any process step, because the body owns steps and the model acts on a summary instead of reading the body.
- A promise of outcome or quality, because the model matches triggers, not benefits.
- A language or framework, unless the skill is specific to one. Then say so.

## Bounds

- Aim at 200 characters and stay within 250, so the sum across the corpus stays inside what the harness shows the model.
- Leave out angle brackets and line breaks, because the harness rejects both.
- Name the skill with an imperative verb phrase of one or two words that says what it does (`spec`, `check-docs`).

## Judgment

- A symptom the model would actually think outranks a category label.
- Trigger-only outranks completeness. Over budget, drop the weakest symptom and keep every "not for".
