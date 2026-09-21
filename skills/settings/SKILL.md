---
name: settings
description: Use when the user asks to see or change an exo setting, for every project, for one repository or for this machine only, such as where shaping stores specs (docs/specs files, GitHub issues or both). Not for the harness's own settings.json, permissions or hooks, and not for the savings switch, which savings owns.
argument-hint: "[nothing for the overview, or a key, a value and --scope project|local]"
allowed-tools: Bash(node *settings.mjs*)
model: haiku
---

# Settings

Show and change exo settings through the script, which checks every value against one schema. The enemy is an overview retold as a sentence, which drops the options and the layers. The overcorrection is asking for a key, value or layer the request already names.

## When to use

- The user asks what an exo setting is, or to change one, such as where specs go.
- Not for the harness's own settings, permissions or hooks, and not for the savings switch.

## The settings

The overview when this skill loaded, then the question that picks a setting:

!`node "${CLAUDE_SKILL_DIR}/scripts/settings.mjs" menu`

## The loop

Take the first step whose answer the request and the digits so far leave open.

1. **Relay** the block above as the whole reply when no setting is named, and run nothing. Keep the ```` ```text ```` fence, the question and every option line unchanged, because the rows line up only in a monospace block.
2. **Write** nothing of your own above the fence or under the last option, because the user answers by typing a digit.
3. **Ask the value** once a digit or the request names the setting but no value: run `node "${CLAUDE_SKILL_DIR}/scripts/settings.mjs" menu <key>` and relay its output the same way.
4. **Ask the layer** once setting and value are known but no layer: everyone on this repository is `project`, only this person here is `local`, every project on this machine is `global`. The question has the shape `## A question` in `using-exo` gives:
   ```text
   1. **Project (Recommended)**: everyone, via .claude/exo.json
   2. **Local**: only you, in this repository
   3. **Global**: every project on this machine
   ```
5. **Set** a project or local value with `node "${CLAUDE_SKILL_DIR}/scripts/settings.mjs" set <key> <value> --scope <project|local>`, then run `show`, because the overview above predates the change. Relay a rejection as the script printed it.
6. **Reply after a set** with the script's confirmation line, then the whole fence `show` printed, unchanged. A project value adds one line under it: collaborators receive it once `.claude/exo.json` is committed.
7. **Point** a global value at `/config`, where each exo option is a row, and run nothing, because the harness owns that file.

## Judgment

- The script's output outranks any value in the context, including the session's `exo settings:` line, which was read when the session started.
- A setting, value or layer the request names outranks its question, and a named layer outranks the recommended one.
- An unknown key or value is the script's rejection to relay, never a value to write by hand.
- A keep option ends the run with one line saying nothing changed.
