# Description

## Contents, in order

1. The moment it fires: the request shape, the symptom, the state of the repository, in third person, opening with "Use when".
2. The words the model would have in mind at that moment: the error text, the tool name, the synonym the user types; a trigger the model cannot match is a trigger that never fires.
3. The "about to violate" tell, once the skill has been through the loop: the thought that precedes the failure, phrased as the model thinks it.
4. "Not for" cases, each naming the owner instead.

## Not in it

- Any step of the process; the body owns the steps.
- A promise of outcome or quality; the model matches triggers, not benefits.
- A language or framework, unless the skill is specific to one, in which case say so.

## Bounds

- Aim at 300 characters and stay within 375, so the sum across the corpus stays inside what the harness shows the model.
- No angle brackets and no line breaks; the harness rejects both.
- The name is an imperative verb phrase of one or two words naming what it does (`spec`, `check-docs`).

## Judgment

- A symptom the model would actually think outranks a category label.
- Trigger-only outranks completeness: a description over its budget loses its weakest symptom, never a "not for".
