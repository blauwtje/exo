# Instruction-file style

This style applies to `CLAUDE.md`, rules, skills, agents, output styles and hooks. The enemy is the line that restates what the model does anyway. The overcorrection is a line cut so far that its boundary is lost.

- Give a bullet one rule: one condition, one action.
- Split a compound bullet, because the model follows a specific rule more consistently than a bundle.
- Split a sentence that carries a second condition or action, unless the split loses its boundary.
- The verifier fails a sentence over 40 words.
- The verifier fails a list item of three or more sentences.
- Put the rules most often broken first in a file, because the model recalls the start of its context best and the middle worst.
- Move what only some paths need to a reference.
- Keep one load path, SKILL.md plus the references that path reads, under about 150 rules, because adherence falls past it and earlier rules win.
- Keep a line only when it prevents a mistake.
- Give each rule one owner: when another file states it, point there or omit it.
- Write for the model: line length, hard wraps and reading grade are human metrics, not targets.
- Write short: drop a word where the meaning stays exact, never one that sets a boundary.
- Leave out comments (HTML included), dates, sources, change history, opinions and examples, unless the rule fails without them.
- Give a reason only where it sets the rule's boundary, in one clause.
- Put an exception beside its rule.
- Define by contrast: "X, not Y".
- When a list's order could read as precedence, say whether the first match wins or every item applies.
- Keep a rule the system prompt also states, because sessions switch models.
- Make what must happen every time without exception a hook, not a rule.
- A hook never rewrites a command inside a pipeline; a guard denies or allows and leaves the command unchanged.
- Use Markdown headers and bullets.
