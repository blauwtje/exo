---
name: configure
description: Use when the user asks to set up exo or see or change an exo setting. Not for the harness's settings.json, permissions or hooks.
disable-model-invocation: true
argument-hint: "[nothing to walk every setting, or a key, a value and --scope project|local]"
allowed-tools: Bash(node *settings.mjs*), Bash(git remote get-url origin), Bash(git rev-parse *), Bash(gh auth status)
---

# Settings

Change exo's settings only through its own scripts, one named setting or every setting in one walk. The enemy is a value the user never picked: a guessed layer, or a walk that writes before its review. The overcorrection is a walk through every setting when the request named one.

## When to use

- Use `## The walk` for `/exo:configure` with nothing after it, or a request to set up or configure exo as a whole.
- Use `## One setting` for a question about one setting, or a request to change one.

## Where things stand

Values when this skill loaded, each with its layer:

!`node "${CLAUDE_SKILL_DIR}/scripts/settings.mjs" show`

## One setting

Take the first step the request and answers so far leave open.

- An answer a menu's `Or type` line names counts as that pick, like its letter, at every step: topic, setting or value.

1. **Relay.** When the request only asks to see the settings, relay the `show` block above as the whole reply and run nothing. Keep its ```` ```text ```` fence unchanged; rows line up only in a monospace block.
2. **Pick the setting.** When the request names none, run `node "${CLAUDE_SKILL_DIR}/scripts/settings.mjs" menu`, relay its output unchanged as the whole reply.
   - When a topic is picked, run `menu work`, `menu places` or `menu safety` and relay it the same way.
3. **Ask the value.** When the setting is known and the value is not, run `node "${CLAUDE_SKILL_DIR}/scripts/settings.mjs" menu <key>`, relay it the same way.
4. **Pick the layer.** When the request names no layer, use project scope: it reaches every collaborator, not only you, and only a named local or global layer changes that. The closing line names the layer used, so the choice stays visible.
5. **Write** with the command `## The write commands` names, then run `show` and relay it under the script's confirmation line; the block above predates the change.
   - When the script rejects the value, relay the rejection as printed and change nothing by hand.
   - For a project value, add one line under the fence: collaborators receive it once `.claude/exo.json` is committed.

## The walk

Follow `references/setup-map.md` from its first step. Leave every answer to the user.

## The write commands

| Setting | Command |
|---|---|
| A key `show` lists, for this repository | `node "${CLAUDE_SKILL_DIR}/scripts/settings.mjs" set <key> <value> --scope <project or local>` |
| A key `show` lists, for every project | None: the harness owns that file. Report names the value to pick for that key under exo in `/config`. |
| The status line | `node "${CLAUDE_SKILL_DIR}/scripts/settings.mjs" statusline`; relay the printed `statusLine` block and its target file, edit no harness settings file. |

## References

| File | Read it when |
|---|---|
| `references/setup-map.md` | The walk, before its first step. Not for one setting. |
| `../route-skills/references/question.md` | Before a message that asks the user a question. |

## Judgment

- A project or local value outranks a global one.
- When the user picks every project for a key that a project or local layer holds, the report names that layer, because the new value stays hidden there.
- Scripts' output outranks any value in context, including the session's `exo settings:` line read at session start.
- Every delegate that writes code reads `../route-skills/references/lean.md` itself. The session text carries no pointer to it and no switch exists, so a request to switch it off gets that answer and runs nothing.
