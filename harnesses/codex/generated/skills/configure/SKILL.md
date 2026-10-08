---
name: configure
description: "Use when the user asks to set up or configure exo, or to see or change one exo setting, such as where specs go or the guards. Not for the harness's own settings.json, permissions or hooks."
---

# Settings

Change exo's settings only through its own scripts, one named setting or every setting in one walk. The enemy is a value the user never picked: a guessed layer, or a walk that writes before its review. The overcorrection is a walk through every setting when the request named one.

## When to use

- `$configure` with nothing after it, or request to set up or configure exo as a whole → `## The walk`.
- Question about one setting, or request to change one → `## One setting`.

## Where things stand

Values when this skill loaded, each with its layer:

Run `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/skills/configure/scripts/settings.mjs" show` first and use its output here.

## One setting

Take the first step the request and letters so far leave open.

1. **Relay.** Request only asks to see the settings → relay the `show` block above as the whole reply, run nothing. Keep its ```` ```text ```` fence unchanged; rows line up only in a monospace block.
2. **Pick the setting.** Request names none → run `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/skills/configure/scripts/settings.mjs" menu`, relay its output unchanged as the whole reply; user answers with a letter.
   - Topic letter → run `menu work`, `menu places` or `menu safety`, in the menu's order, relayed the same way.
3. **Ask the value.** Setting known, no value → run `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/skills/configure/scripts/settings.mjs" menu <key>`, relay it the same way. For `ship`, a typed answer also counts: a value its context line names.
4. **Ask the layer.** Key `show` lists, setting and value known, no layer → ask:
   ```text
   **Who should this apply to?**

   - **(A) Project**: everyone who works in this repository.
   - **(B) Local**: only you, in this repository.
   - **(C) Global**: you, in every project on this machine.

   Recommended: (A), because the whole team gets the same value, and (B) and (C) reach only you.
   ```
5. **Write** with the command `## The write commands` names, then run `show` and relay it under the script's confirmation line; the block above predates the change.
   - Rejection → relay it as the script printed it, change nothing by hand.
   - Project value → add one line under the fence: collaborators receive it once `.claude/exo.json` is committed.

## The walk

Follow `references/setup-map.md` from its first step. Never pick an answer for the user.

## The write commands

| Setting | Command |
|---|---|
| A key `show` lists, for this repository | `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/skills/configure/scripts/settings.mjs" set <key> <value> --scope <project or local>` |
| A key `show` lists, for every project | None: the harness owns that file. Report names the value to pick for that key under exo in `/config`. |

## References

| File | Read it when |
|---|---|
| `references/setup-map.md` | The walk, before its first step. Not for one setting. |
| `../route-skills/references/question.md` | Before a message that asks the user a question. |

## Judgment

- A project or local value outranks a global one.
- User picks every project for a key a project or local layer holds → report names that layer; the new value stays hidden there.
- Scripts' output outranks any value in context, including the session's `exo settings:` line, read at session start.
- The pointer to `../route-skills/references/lean.md` has no switch and rides in every session, whatever `guards` holds: request to switch it off → give that answer, run nothing.
