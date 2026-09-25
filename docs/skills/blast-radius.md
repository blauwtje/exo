# blast-radius

Finds what a change breaks outside its diff before it lands, and proves the fact its safety rests on by running the real code rather than writing it up.

## When it fires

A diff is about to merge or ship and its effect can reach code, data or processes it does not touch, the user asks what a change could break, or a brief claims existing code already handles something or that nothing depends on something. A reported failure belongs to debug, explaining how code works to investigation, checking a plan branch against its plan to the branch-reviewer agents, and an edit contained in one function to no skill at all.

## What you get

- The one fact the change is safe because of, stated in a sentence and proven by a throwaway script that imports the real module or pinned library, with its output pasted.
- Every safety fact ranked by how far it was proven: asserted, pointed at `file:line`, traced, ran a script, or reproduced live; anything below a run is reported at its level, never as safe.
- A search past what symbol lookup finds: callbacks the change now fires, fields read through built keys, other languages reading the same data, and the installed library source rather than its README.
- A hand-back with risks and cleared checks in separate lists and the cheapest test that would catch the real break; a proven break stops the merge or the design until the user decides.

## Where its rules live

`skills/blast-radius/SKILL.md`, with `references/hand-back.md`.
