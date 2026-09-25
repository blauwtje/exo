---
name: start
description: "Use when the user does not remember a skill's name, wants the list of exo skills in plain words, or names a goal and wants exo to pick. Not for a session's own routing rules, which route-skills owns and loads by itself."
argument-hint: "[goal]"
disable-model-invocation: true
---

# Start

One door for a user who does not remember a skill's name. The enemy is a list nobody reads before falling back to doing the work by hand. The overcorrection is picking and running a skill before the user sees which one.

## When to use

- `/exo:start` with nothing after it: relay the cheat sheet.
- `/exo:start <goal>`: pick the one skill for that goal and invoke it.
- Not for a session's own routing rules: `route-skills` owns those and loads on its own; it is never itself a pick.

## No goal

Relay the two tables in `references/cheat-sheet.md` as the whole reply, rows unchanged, because they line up only as written; leave out that file's own opening paragraph and `## Judgment`, which are notes for whoever edits this skill, not for the user.

## With a goal

1. **Match.** Read every skill's `description` and pick the one whose trigger fits the stated goal, the same match a session makes on its own under `route-skills`.
2. **Several fit.** Order by `route-skills`' "When several fire" section rather than guessing.
3. **None fits.** Follow `route-skills` step 2 and do the work without a skill.
4. **Invoke or tell.** Call the picked skill through the Skill tool with the goal as its argument; a skill carrying `disable-model-invocation` cannot be called that way, so name the exact command to type instead, such as `/exo:remember <goal>`.

## References

| File | Read it when |
|---|---|
| `references/cheat-sheet.md` | `/exo:start` with no goal: relay its two tables as the reply. |

## Judgment

- A goal naming a skill outranks a close description match: "run the plan" picks `run-plan` even when another description reads close.
- `route-skills`' order outranks a guess when two skills fit the goal equally well.
