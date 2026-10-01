# Instruction-file style

This style applies to `CLAUDE.md`, rules, skills, agents, output styles and hooks. The enemy is the line that restates what the model does anyway. The overcorrection is a line cut so far that its boundary is lost.

- Give a bullet one rule: one condition, one action, at most one reason clause; split a compound bullet.
- Split a sentence over 25 words, unless the split loses its boundary; the verifier fails one over 40.
- Put the rules most often broken first in a file; move what only some paths need to a reference.
- Keep one load path, SKILL.md plus the references that path reads, under about 150 rules, because adherence falls past it and earlier rules win.
- Write for the model: line length, hard wraps and reading grade are human metrics, not targets.
- Write short: drop a word where the meaning stays exact, never one that sets a boundary.
- Leave out comments (HTML included), dates, sources, change history, opinions and examples, unless the rule fails without them.
- Give a reason only where it sets the rule's boundary, in one clause.
- Put an exception beside its rule.
- Define by contrast: "X, not Y".
- Make a ladder stop at the first match, and make its first step ask whether the thing needs to exist.
- Give each rule one owner: when another file states it, point there or omit it; keep a rule the system prompt also states, because sessions switch models.
- Keep a line only when it prevents a mistake. What must happen every time without exception is a hook, not a rule.
- A hook never rewrites a command inside a pipeline; a guard denies or allows and leaves the command unchanged.
- Use Markdown headers and bullets.
