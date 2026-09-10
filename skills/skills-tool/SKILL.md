---
name: skills-tool
description: Use when creating a skill or agent, editing one, or judging whether one is too long, before the edit is made and before it is called done.
---

# Skills tool

A skill is the shortest text that stops a failure the model makes without it. The enemy is the skill that restates what the model already does and buries the one rule that mattered. The overcorrection is a bare imperative with no reason, which the model follows literally and cannot bound.

## When to use

- A new skill or agent, an edit to one, or the question whether one is bloated.
- Not for `CLAUDE.md`, a rule or an output style: `instruction-style.md` in the user's rules owns those.

## The shape

| Part | Contract |
|---|---|
| `description` | The trigger only, at most 400 characters: when it fires and when it does not. A description that states the workflow gets followed instead of the body. |
| Opening | One paragraph: the principle, the enemy, the overcorrection. |
| `## When to use` | Bullets with the symptoms, then the "not for" cases. |
| Process | A numbered ladder that stops at the first match, at most eight steps, each a rule plus its reason. |
| `## Red flags` | Only for a skill the model is tempted to skip: a thought-to-reality table. |
| `## References` | A table of file and "read it when"; a reference is loaded at the step that needs it, never earlier. |
| `## Judgment` | Which rule wins when two collide, as a ladder. |

## Budgets

- Body under 500 words for a stage skill, under 150 for a gateway skill, under 900 for a skill that carries a contract; the ceiling in `verify/budgets.mjs` is the line limit that fails the build.
- One sentence per line, under 25 words; a bullet is at most two lines.
- Heavy material (a template, a worked example, a checklist over 20 lines) goes to `references/`; the body points to it with the moment to read it.
- Text the skill hands to a delegate is `<role>-prompt.md` beside `SKILL.md`, in the References table with its dispatch step; `references/` holds only what the skill itself reads mid-run.

## The loop

1. Name the failure the skill must stop, as one observable symptom in one prompt, and save that prompt under `evals/<skill>/`.
2. Run the prompt without the skill: a `general-purpose` delegate given the prompt alone, or `claude -p` in a scratch repository without `--plugin-dir`; record the exact rationalization it produced.
3. Write the skill against that rationalization, in the shape above, inside the budget.
4. Run the prompt with the skill: the same delegate told to load it, or `claude -p --plugin-dir <clone>`; a pass the baseline also passed proves nothing, so tighten the case until the baseline fails.
5. Run `node verify.mjs`; a red check is a budget or structure fault to fix, not to exempt.

## Red flags

| Thought | Reality |
|---|---|
| "The body explains why, so it may be long." | A reason is one clause per rule; a paragraph of reasons is a reference. |
| "This edit is too small to test." | An untested edit is a guess about model behavior; the baseline run is the only evidence. |
| "The model knows this already." | Then the line is cut; only what the baseline run got wrong stays. |

## References

| File | Read it when |
|---|---|
| `references/skill-shape.md` | Writing a skill from nothing, at step 3; never for an edit to an existing skill. |

## Judgment

- A rule the baseline run violated outranks a rule that reads well.
- The budget outranks completeness: a skill over budget loses its weakest rule, never its reason clauses.
- `instruction-style.md` outranks this skill where the two disagree on wording.
