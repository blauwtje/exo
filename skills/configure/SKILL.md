---
name: configure
description: "Shows and changes exo's settings (specs, ship) and prints the status line block. Use for one exo setting, given as a key and a value. Not for the harness's settings.json, permissions or hooks."
disable-model-invocation: true
argument-hint: "[a key, a value and --scope project|local]"
allowed-tools: Bash(node *settings.mjs*)
---

# Settings

Show exo's settings and change one only when the user names it and its value, because a value the user never picked is wrong.

## Where things stand

!`node "${CLAUDE_SKILL_DIR}/scripts/settings.mjs" show`

## Change one

1. When the request only asks to see settings, relay the block above unchanged in its text fence and run nothing.
2. When the key or value is missing, ask for it with the options `show` lists. Use project scope unless the user names local, because project reaches every collaborator.
3. Run `node "${CLAUDE_SKILL_DIR}/scripts/settings.mjs" set <key> <value> --scope <project or local>`. Relay a rejection as printed and change nothing by hand.
4. Run `show` again and relay it under the confirmation line, because the block above predates the change. For a project value, add that collaborators receive it once `.claude/exo.json` is committed.
5. A value for every project is not written here: name the row to pick for that key under exo in `/config`.
6. For the status line run `node "${CLAUDE_SKILL_DIR}/scripts/settings.mjs" statusline` and relay the printed `statusLine` block and target file.

## Judgment

- A project or local value outranks a global one, so when the user picks every project for a key a narrower layer holds, name that layer.
