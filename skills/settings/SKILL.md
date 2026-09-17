---
name: settings
description: Use when the user asks to see or change an exo setting, for every project, for one repository or for this machine only, such as where shaping stores specs (docs/specs files, GitHub issues or both). Not for the harness's own settings.json, permissions or hooks, and not for the savings switch, which savings owns.
argument-hint: "[show, or a key, a value and a scope]"
allowed-tools: Bash(node *settings.mjs*)
model: haiku
---

# Settings

Show and change exo settings through the script, which checks every value against one schema. The enemy is a hand-edited JSON file holding a value no skill reads. The overcorrection is asking which layer to use when the request already names one.

## When to use

- The user asks what an exo setting is, or to change one, such as where specs go.
- Not for the harness's own settings, permissions or hooks, and not for the savings switch.

## The settings

The effective values when this skill loaded, each with the layer it came from:

!`node "${CLAUDE_SKILL_DIR}/scripts/settings.mjs" show`

## The loop

1. **Show** the block above for a request that only asks what is set, and run nothing, because a second run prints the same block.
2. **Pick the layer** from the request: everyone on this repository is `project`, only this person here is `local`, every project on this machine is `global`. A request that names none asks, in the shape `## A question` in `using-exo` gives:
   ```text
   1. **Project (Recommended)**: everyone, via .claude/exo.json
   2. **Local**: only you, in this repository
   3. **Global**: every project on this machine
   ```
3. **Set** a project or local value with `node "${CLAUDE_SKILL_DIR}/scripts/settings.mjs" set <key> <value> --scope <project|local>`, then run `show`, because the block above predates the change. Relay a rejection as the script printed it.
4. **Point** a global value at `/config`, where each exo option is a row, and run nothing, because the harness owns that file.
5. **Report** in one line where the value now lives; a project value reaches collaborators only once `.claude/exo.json` is committed, which that line says.

## Judgment

- The script's output outranks any value in the context, including the session's `exo settings:` line, which was read when the session started.
- A layer the request names outranks the recommended one.
- An unknown key or value is the script's rejection to relay, never a value to write by hand.
