---
name: configure
description: Use when the user asks to set up or configure exo, or to see or change one exo setting, such as where specs go or the guards. Not for the harness's own settings.json, permissions or hooks.
argument-hint: "[nothing to walk every setting, or a key, a value and --scope project|local]"
allowed-tools: Bash(node *settings.mjs*), Bash(git remote get-url origin), Bash(git rev-parse *), Bash(gh auth status)
model: sonnet
---

# Settings

Change exo's settings only through its own scripts, one named setting or every setting in one walk. The enemy is a value the user never picked: a guessed layer, or a walk that writes before its review. The overcorrection is a walk through every setting when the request named one.

## When to use

- `/exo:configure` with nothing after it, or a request to set up or configure exo as a whole: take `## The walk`.
- A question about one setting, or a request to change one: take `## One setting`.

## Where things stand

The values when this skill loaded, each with its layer:

!`node "${CLAUDE_SKILL_DIR}/scripts/settings.mjs" show`

## One setting

Take the first step whose answer the request and the letters so far leave open.

1. **Relay** the `show` block above as the whole reply when the request only asks to see the settings, and run nothing. Keep its ```` ```text ```` fence unchanged, because the rows line up only in a monospace block.
2. **Pick the setting** when the request names none: run `node "${CLAUDE_SKILL_DIR}/scripts/settings.mjs" menu` and relay its output unchanged as the whole reply, because the user answers it with a letter.
   - A topic letter runs `menu work`, `menu places` or `menu safety`, in the menu's order, relayed the same way.
3. **Ask the value** once the setting is known but no value: run `node "${CLAUDE_SKILL_DIR}/scripts/settings.mjs" menu <key>` and relay it the same way. A typed answer also counts for `ship`: a value its context line names.
4. **Ask the layer** for a key `show` lists once setting and value are known but no layer:
   ```text
   **Who should this apply to?**
   The value can apply to one repository or to every project.

   - **(A) Project**: everyone who works in this repository.
   - **(B) Local**: only you, in this repository.
   - **(C) Global**: you, in every project on this machine.

   Recommended: (A), because the whole team gets the same value, and (B) and (C) reach only you.
   ```
5. **Write** with the command `## The write commands` names, then run `show` and relay it under the script's confirmation line, because the block above predates the change.
   - Relay a rejection as the script printed it and change nothing by hand.
   - A project value adds one line under the fence: collaborators receive it once `.claude/exo.json` is committed.
6. **Point** a global value at `/config`, where each exo option is a row, and run nothing.

## The walk

Follow `references/setup-map.md` from its first step. Never pick an answer for the user.

## The write commands

| Setting | Command |
|---|---|
| A key `show` lists, for this repository | `node "${CLAUDE_SKILL_DIR}/scripts/settings.mjs" set <key> <value> --scope <project or local>` |
| A key `show` lists, for every project | None: the harness owns that file. The report names the value to pick for that key under exo in `/config`. |

## References

| File | Read it when |
|---|---|
| `references/setup-map.md` | The walk, before its first step: every step, the order, and how each setting is asked. Not for one setting. |
| `../route-skills/references/question.md` | Before a message that asks the user a question. |

## Judgment

- A project or local value outranks a global one.
- When the user picks every project for a key such a layer holds, the report names that layer, because the new value stays hidden there.
- The scripts' output outranks any value in the context, including the session's `exo settings:` line, which was read when the session started.
- A setting, value or layer the request names outranks its question.
- The pointer to `../route-skills/references/lean.md` has no switch and rides in every session, whatever `guards` holds: a request to switch it off gets that answer and runs nothing.
