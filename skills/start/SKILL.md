---
name: start
description: "Use when the user does not remember a skill's name, wants the list of exo skills in plain words, or names a goal and wants exo to pick. Not for a session's own routing rules, which route-skills owns and loads by itself."
argument-hint: "[goal or spec-path]"
disable-model-invocation: true
---

# Start

One door for a user who does not remember a skill's name. The enemy is a pick handed back for the user to type, or a list nobody reads before falling back to doing the work by hand. The overcorrection is a question when only one route fits the goal.

## When to use

- `/exo:start` with nothing after it: relay the cheat sheet.
- `/exo:start <goal>`: route the goal by `route-skills`' rules and run the picked stage in the same turn.
- `/exo:start <spec-path>`, or a spec or big wish to build: `spec`, which writes the brief with its task list, then offers `build`.
- Not for a session's own routing rules: `route-skills` owns those and loads on its own; it is never itself a pick.

## No goal

Relay the two tables in `references/cheat-sheet.md` as the whole reply, rows unchanged, because they line up only as written; leave out that file's own opening paragraph and `## Judgment`, which are notes for whoever edits this skill, not for the user.

## With a goal

1. **Match.** Read every skill's `description` for the triggers that fit the stated goal, the same match a session makes on its own under `route-skills`.
   The exception is a path to a spec file, or a spec or big wish to build: pick `spec` with that path or wish as its argument; it offers `build` once the brief is written, so start runs nothing after it.
2. **Two routes, different work.** A goal that leaves open whether behavior stays or changes fits both a behavior-keeping and a behavior-changing skill; ask one question per `../route-skills/references/question.md` and run nothing before the answer, because the wrong pick does work the answer undoes. Two skills leading to the same work take the first.
3. **Several fit.** Otherwise pick the one, ordering by `route-skills`' "When several fire" section rather than guessing.
4. **None fits.** Follow `route-skills` step 2 and do the work without a skill.
5. **Run.** Call the picked skill through the Skill tool in this turn with the goal as its argument, before any edit or write, and tell the user no command to type, because they already typed one; a skill carrying `disable-model-invocation` cannot be called that way, so name the exact command to type instead, such as `/exo:remember <goal>`.
6. **Chain.** Each stage's own handoff carries the run on to `ship`; add no stop, summary or question between stages, because the stage's next-stage question is the user's one choice.

## References

| File | Read it when |
|---|---|
| `references/cheat-sheet.md` | `/exo:start` with no goal: relay its two tables as the reply. |

## Judgment

- A goal naming a skill outranks a close description match: "run the plan" picks `build` even when another description reads close.
- `route-skills`' order outranks a guess when two skills fit the goal equally well.
