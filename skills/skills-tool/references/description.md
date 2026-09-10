# Description

The description is the only text the model reads before deciding to load the skill, so it carries the trigger and nothing else. The enemy is a description that summarizes the workflow, which the model follows as a shortcut instead of reading the body. The overcorrection is a description so terse it names no symptom the model would ever match.

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

- At most 400 characters, so the sum across the corpus stays inside what the harness shows the model.
- No angle brackets and no line breaks; the harness rejects both.
- The name is a verb or gerund for a process (`shaping`, `planning`), a noun for a reference or tool (`research`, `skills-tool`).

## Judgment

- A symptom the model would actually think outranks a category label.
- A "not for" that names the owner outranks a bare exclusion.
- Trigger-only outranks completeness: a description over 400 characters loses its weakest symptom, never a "not for".
