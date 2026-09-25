# Hand-back

The result a reviewer, a planner or the user acts on. The enemy is a verdict with no level behind it, which the reader cannot tell from a proven one. The overcorrection is a report so long the one blocking risk sits in the middle of it.

## Sections, in order

1. **What it does.** Two or three sentences on the behavior change, including what the diff does not spell out.
2. **The one fact.** The sentence the change is safe because of, its level tag (`[1 asserted]`, `[2 file:line]`, `[3 traced]`, `[4 ran]`, `[5 live]`), and the proof: the command and its output, or the word "unproven".
3. **Risks.** Each with its `file:line`, how likely, what it costs when it happens, its level tag, and the output for any at level 4 or 5.
4. **Cleared.** What was checked and found fine, each with its reason and level tag; a search that found nothing names the search.
5. **Before you merge.** The cheapest test or reproduction that would catch the real break, including the throwaway script when one was written.

## Rules

- Cite only a `file:line` opened this session; never name a caller, field or API not seen in the code.
- A claim from a brief that proved false goes first, above section 1, because a design is about to be built on it.
- Strip secrets, customer data and internal hostnames before the result leaves the session.
