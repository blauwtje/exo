# Description

## Contents, in order

1. The moment it fires: request shape, symptom, repository state; third person, opening "Use when".
2. Words the model would have in mind then: error text, tool name, the user's synonym. A trigger the model cannot match never fires.
3. After the skill has been through the loop: the "about to violate" tell, the thought preceding the failure, phrased as the model thinks it.
4. "Not for" cases, each naming the owner.

## Not in it

- Any process step; the body owns steps.
- Promise of outcome or quality; the model matches triggers, not benefits.
- A language or framework, unless the skill is specific to one; then say so.

## Bounds

- Aim at 200 characters and stay within 250, so the sum across the corpus stays inside what the harness shows the model.
- No angle brackets, no line breaks; the harness rejects both.
- Name → imperative verb phrase, one or two words, naming what it does (`spec`, `check-docs`).

## Judgment

- A symptom the model would actually think outranks a category label.
- Trigger-only outranks completeness: over budget → drop the weakest symptom, never a "not for".
