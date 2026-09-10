---
name: skills-tool
description: Use when creating a skill or agent, editing one, or judging whether one is too long, before the edit is made and before it is called done.
---

# Skills tool

A skill is the shortest text that stops a failure the model makes without it. The enemy is the skill that restates what the model already does and buries the one rule that mattered. The overcorrection is a bare imperative with no reason, which the model follows literally and cannot bound.

## When to use

- A new skill or agent, an edit to one, or the question whether one is bloated.
- Not for a one-off fix, a convention one project holds, or a constraint a regex can enforce: those go to a commit, `CLAUDE.md`, or the verifier, because a skill is for a judgment call.
- Not for `CLAUDE.md`, a rule or an output style: the instruction-style rule in the user's rules owns those.

## The shape

| Part | Contract |
|---|---|
| `description` | The trigger only, at most 400 characters: when it fires and when it does not. A description that states the workflow gets followed instead of the body; `references/description.md` has the contents in order. |
| Opening | One paragraph: the principle, the enemy, the overcorrection. |
| `## When to use` | Bullets with the symptoms, then the "not for" cases. |
| Process | A numbered ladder that stops at the first match, at most eight steps, each a rule plus its reason. |
| `## Red flags` | Only for a skill the model is tempted to skip: a thought-to-reality table. |
| `## References` | A table of file and "read it when"; a reference is loaded at the step that needs it, never earlier. |
| `## Judgment` | Which rule wins when two collide, as a ladder. |

## Form

- One sentence per line, under 25 words; a bullet is at most two lines.
- Heavy material (a template, a worked example, a checklist over 20 lines) goes to `references/`; the body points to it with the moment to read it.
- Text the skill hands to a delegate is `<role>-prompt.md` beside `SKILL.md`, in the References table with its dispatch step; `references/` holds only what the skill itself reads mid-run.

## The loop

1. Name the failure the skill must stop, as one observable symptom in one prompt built as `references/pressure-scenarios.md` describes, and save that prompt under `evals/<skill>/`.
2. Run the prompt without the skill: a `general-purpose` delegate given the prompt alone, or `claude -p` in a scratch repository without `--plugin-dir`; record the exact rationalization it produced.
3. Classify that failure with `references/form-by-failure.md`, then write the skill against it in the shape above, worded as `references/wording.md` says.
4. Run the prompt with the skill: the same delegate told to load it, or `claude -p --plugin-dir <clone>`; a pass the baseline also passed proves nothing, so tighten the case until the baseline fails.
5. For each new rationalization the run produced, plug it as `references/plugging-holes.md` says and rerun every case; the skill is done when no case adds a row.
6. Run `node verify.mjs`; a red check is a structure fault to fix, not to exempt.

## Red flags

| Thought | Reality |
|---|---|
| "The body explains why, so it may be long." | A reason is one clause per rule; a paragraph of reasons is a reference. |
| "This edit is too small to test." | An untested edit is a guess about model behavior; the baseline run is the only evidence. |
| "The model knows this already." | Then the line is cut; only what the baseline run got wrong stays. |
| "A rule against it is enough." | A prohibition on a shaping failure yields more of it; the form follows the failure. |
| "I will test it once the batch of skills is written." | One skill passes every case before the next starts; a batch shares its holes. |

## References

| File | Read it when |
|---|---|
| `references/pressure-scenarios.md` | Building the case at step 1, and when a baseline passes an academic prompt. |
| `references/form-by-failure.md` | At step 3, before the first rule is written, to match the form to the baseline failure. |
| `references/wording.md` | At step 3 when two phrasings compete, or the register of a rule is in doubt. |
| `references/description.md` | At step 3 for the frontmatter, and at step 5 when a symptom joins the description. |
| `references/skill-shape.md` | Writing a skill from nothing, at step 3; never for an edit to an existing skill. |
| `references/plugging-holes.md` | At step 5, once a run with the skill loaded still produced a rationalization. |

## Judgment

- A rule the baseline run violated outranks a rule that reads well.
- An untested edit is reverted, not kept as a draft; a skill edit without its baseline run is a guess.
- Brevity outranks completeness: a bloated skill loses its weakest rule, never its reason clauses.
- The user's instruction-style rule outranks this skill where the two disagree on wording.
