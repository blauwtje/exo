---
name: skills-tool
description: Use when creating, editing or sizing a skill or agent, before the edit and before it is called done. Not for CLAUDE.md, a rule or an output style.
argument-hint: <skill or agent to create, edit or size>
---

# Skills tool

A skill earns its place only by stopping a mistake the model makes when the skill is absent, in as few words as that takes. The enemy is the skill that describes behavior the model already has and hides the one rule that changes anything. The overcorrection is an order stripped of its reason, which the model obeys to the letter without knowing where it ends.

## When to use

- Creating a skill or an agent, changing one, or judging whether one has grown too long.
- Not for a fix that happens once, a habit of one project, or a limit a regex can check: a commit, `CLAUDE.md` or the verifier holds those, because a skill exists for a call that needs judgment.
- Not for `CLAUDE.md`, a rule or an output style.

## The shape

| Part | Contract |
|---|---|
| `description` | At most 400 characters of trigger: the moments it fires and the ones it does not. Workflow written into the description replaces the body, because the model acts on the summary it already read; `references/description.md` lists what goes in and in which order. |
| Opening | A single paragraph naming the principle, the enemy and the overcorrection. |
| `## When to use` | Bullets naming the symptoms first, then each "not for" case. |
| Process | Numbered steps, at most eight, taken in order until one matches; every step is a rule with its reason. |
| `## Red flags` | Only in a skill the model is tempted to skip: a table from the tempting thought to what is actually true. |
| `## References` | A table of each file and the moment to read it; nothing is loaded before the step that needs it. |
| `## Judgment` | A ladder saying which rule wins when two conflict. |

## Form

- A line holds one sentence of fewer than 25 words; a bullet runs two lines at most.
- Bulk material, such as a template, a worked example or a checklist longer than 20 lines, lives in `references/`, and the body names the moment to open it.
- Text handed to a delegate lives beside `SKILL.md` as `<role>-prompt.md` and appears in the References table with the step that dispatches it; `references/` is only for what the skill reads during its own run.

## The loop

1. **Catch the mistake.** Write one prompt, built as `references/pressure-scenarios.md` describes, whose answer shows the mistake as one observable symptom; save it as `evals/<skill>-<case>/prompt.md` with a grader next to it, in the layout `tests/evals.test.mjs` checks.
2. **Watch it happen.** Give that prompt alone to a `general-purpose` delegate on the model the skill under test runs on, or to `claude -p` in a scratch repository without `--plugin-dir`, and copy down the exact justification it gives.
3. **Choose the home.** Place the fix with `references/where-a-fix-lives.md`, then write what must be prose in the shape above and in the register `references/wording.md` sets.
4. **Watch it stop.** Rerun the prompt with the skill: the same delegate told to load it, or `claude -p --plugin-dir <clone>`; when the run without the skill also passed, the case shows nothing, so harden it until that run fails.
5. **Close each new excuse.** For every justification the run with the skill still produced, apply `references/plugging-holes.md` and rerun all cases; the skill is finished when a full rerun adds nothing to its tables.
6. **Verify.** Run `node verify.mjs`; a red check means the structure is wrong and gets fixed, never exempted.

## Red flags

| The excuse | What holds |
|---|---|
| "The body has room to explain itself." | Each rule gets one reason clause; reasons that need a paragraph belong in a reference. |
| "An edit this small needs no test run." | Without the run lacking the skill, the edit is a guess about what the model does. |
| "Any model already knows this." | Then the line goes; only what the run without the skill got wrong earns a place. |
| "Forbidding it will do." | Forbidding a wrong output shape tends to produce more of it; the failure picks the form. |
| "I will test them together once all the skills are written." | Each skill clears every case before the next one begins, because skills written in a batch hide each other's gaps. |

## References

| File | Read it when |
|---|---|
| `references/pressure-scenarios.md` | Writing the prompt in step 1, and whenever the run without the skill passes a prompt that only asks for the rule. |
| `references/where-a-fix-lives.md` | In step 3, before writing the first rule, to find the cheapest place that stops the observed mistake. |
| `references/wording.md` | In step 3, when two phrasings compete or the tone of a rule is unclear. |
| `references/description.md` | In step 3 for the frontmatter, and in step 5 when a symptom is added to the description. |
| `references/skill-shape.md` | In step 3 when the skill starts from nothing; never for a change to an existing skill. |
| `references/plugging-holes.md` | In step 5, once a run with the skill loaded still produced a justification. |

## Judgment

- A rule the run without the skill broke outranks a rule that only reads well.
- An edit that was never tested is reverted rather than kept as a draft, because without the run lacking the skill it is a guess.
- Short outranks complete: a skill that grew too long drops its weakest rule, never a reason clause.