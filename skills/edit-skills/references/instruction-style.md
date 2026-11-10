# Instruction-file style

This guide covers `CLAUDE.md`, rules, skills, agents, output styles and hook text. Two readers use these files: the model that follows them and the maintainer who reviews them, so write plain sentences that both can read.

## Open with the goal

- Open each skill and agent with one sentence that says what it produces and for whom, so a newcomer knows the point before the first rule.
- Put the rules the model breaks most near the top, because later rules get less weight.
- Define each coined term once, in bold, where it first appears, or use a plain word instead.
- Use one term per concept, and prefer the established term to a coined one.

## Write each rule as a sentence

- Write one sentence with a verb per rule, as a bare imperative or in the second person: "Run the tests before you commit."
- Keep arrows for routing tables, where a condition maps to an action. At most 30% of the bullets in a file may carry one.
- Hold a bullet to one condition and one action, and split a compound bullet unless the split loses the boundary.
- Chain at most one semicolon in a bullet. Two or more mean two rules.
- Put an exception beside its rule, and say whether the first match wins or every item applies when the order could read as precedence.
- Define a term by contrast: "X, not Y".

## Give the reason

- Add one clause that says why when the reason sets the rule's boundary: "Pass the path, because the script resolves nothing itself."
- Skip the reason when the rule explains itself.
- Phrase the target behavior positively, as in "Write in plain sentences". Keep a negative for a discrete prohibition such as "do not run `git stash`".
- Use `never` and `IMPORTANT` only for a real guardrail, at most 2 per file. Capitals and `MUST` make a model over-apply the rule.

## Keep the words that set a boundary

- Keep `not`, `no`, `only`, `except`, `never`, `unless`, `each`, `every`, `at most`, `before`, `after`, numbers, paths, commands, identifiers and error text. A shortened rule that loses one changes its meaning.
- Rewrite a line that reads ambiguous instead of shortening it further.
- Use a number or an exact command in place of an adjective: "kill a run past 10 minutes".
- Em dashes: use none.
- Line length, hard wraps and reading grade are not targets.
- Leave out "think carefully", because thinking is always on.

## Cut

- Cut a line when the model errs without it no more than with it: default behavior, what the code shows, stale text, a rule another file owns.
- Keep a rule the system prompt also states, because sessions switch models.
- Cut comments, sources, change history, opinions and dates, except a date on a fact that will age.
- Show a Good and a Bad instance only for a rule that shapes an output, three to five varied with one edge case, beside the rule it shows, so the model copies the right pattern.
- Drop an example of reasoning steps, and a verification line such as "double-check", because both make a reasoning model over-verify.
- Ask a review prompt for all findings, then filter by severity afterwards.
- Name delegation criteria or a cap in a brief that may spawn agents, and restate the parent's constraints.
- Name the kinds of early stop to avoid in an unattended prompt.
- Lower `effort` when less thinking is wanted, not the prose.

## Place and enforce

- Keep a rule that must hold every time in `CLAUDE.md` or a check, because `.claude/rules/*.md` with `paths:` loads unreliably.
- An `@` import organizes the file and cuts no context, since imported text loads at launch.
- Keep `CLAUDE.md` under 60 lines. Move material only some paths need to a reference, one level deep, loaded through a pointer that names when to open it.
- `## Form` in the edit-skills skill gives the skill body token aim and cap. A skill file stays under 500 lines, a hard cap.
- Keep a load path (skill body plus the references it reads) under about 150 rules.
- The verifier fails a sentence over 40 words and a list item of 3 or more sentences.
- Put a rule that must hold every time in a verifier in `npm run check`, since a hook adds overhead to every session.
- A guard denies or allows and leaves the command unchanged.
