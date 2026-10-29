---
name: start
description: Use when the user asks anything about exo skills or commands, like which to run for a task or if one exists. Answer through this skill. Not for routing rules.
argument-hint: "[goal or spec-path]"
---

# Start

One door for a user who does not remember a skill's name. The enemy is a pick handed back for the user to type, or a list nobody reads before falling back to doing the work by hand. The overcorrection is a question when only one route fits the goal.

## No goal

- Relay the two tables in `references/cheat-sheet.md` as the whole reply, rows unchanged; they line up only as written.

## With a goal

1. **Match.** Read every skill's `description` for triggers fitting the stated goal.
   - Path to a spec file, or a spec or big wish to build → `spec`, with that path or wish as argument.
   - Start runs nothing after `spec`, which offers `build` once the brief is written.
   - `route-skills` is never a pick.
2. **Two routes, different work.** Goal leaves open whether behavior stays or changes → fits a behavior-keeping and a behavior-changing skill.
   - Run nothing before the answer; a wrong pick does work the answer undoes.
   - Ask one question per `../route-skills/references/question.md`.
3. **None fits.** Check the no-skill list in `../../hooks/session-routing.md`; do the work without a skill.
4. **Run.** Call the picked skill through the Skill tool in this turn, goal as argument, before any edit or write.
   - Tell the user no command to type; they already typed one.
   - Skill carrying `disable-model-invocation` cannot be called that way → name the exact command to type instead, such as `/exo:improve <goal>`.
5. **Chain.** Each stage's handoff carries the run on to `ship`: add no stop, summary or question of your own between stages; only the questions each stage's skill prescribes reach the user.

## References

| File | Read it when |
|---|---|
| `references/cheat-sheet.md` | `/exo:start` with no goal. |

## Judgment

- A goal naming a skill outranks a close description match: "run the plan" picks `build` even when another description reads close.
