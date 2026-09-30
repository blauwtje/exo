# Instruction-file style

This style applies to `CLAUDE.md`, rules, skills, agents, output styles and hooks. The enemy is the line that restates what the model does anyway. The overcorrection is a line cut so far that its boundary is lost.

- Write as short as possible; drop grammar where the meaning stays exact.
- Leave out comments (HTML included), dates, sources, change history, opinions and examples, unless the rule fails without them.
- Give a reason only where it sets the rule's boundary, in one clause.
- Put an exception beside its rule.
- Define by contrast: "X, not Y".
- Make a ladder stop at the first match, and make its first step ask whether the thing needs to exist.
- Give each rule one owner: when another file states it, point there or omit it; keep a rule the system prompt also states, because sessions switch models.
- Keep a line only when it prevents a mistake. What must happen every time without exception is a hook, not a rule.
- A hook never rewrites a command inside a pipeline; a guard denies or allows and leaves the command unchanged.
- Use Markdown headers and bullets.
