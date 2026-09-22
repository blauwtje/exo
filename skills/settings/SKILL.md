---
name: settings
description: Use when the user asks to set up or configure exo, or to see or change one exo setting, such as where specs go, the savings counter or the read guard, for every project, one repository or this machine. Not for the harness's own settings.json, permissions or hooks.
argument-hint: "[nothing to walk every setting, or a key, a value and --scope project|local]"
allowed-tools: Bash(node *settings.mjs*), Bash(node *savings.mjs*), Bash(node *question-page.mjs*), Bash(git remote get-url origin), Bash(git rev-parse *), Bash(gh auth status)
model: sonnet
---

# Settings

Change exo's settings only through its own scripts, one named setting or every setting in one walk. The enemy is a value the user never picked: a guessed layer, or a walk that writes before its review. The overcorrection is a walk through every setting when the request named one.

## When to use

- The user runs `/exo:settings` with nothing after it, or asks to set up, personalize or configure exo as a whole: take `## The walk`.
- The user asks what a setting is or to change one, such as where specs go, the reply style, the savings counter, the read guard or its line limit: take `## One setting`.
- Not for the harness's own settings, permissions or hooks, and not for the savings figures, which `savings` reports.

## Where things stand

The values when this skill loaded, each with the layer it came from:

!`node "${CLAUDE_SKILL_DIR}/scripts/settings.mjs" show`

The savings counter, then the read guard and its line limit:

!`node "${CLAUDE_SKILL_DIR}/../savings/scripts/savings.mjs" status`

!`node "${CLAUDE_SKILL_DIR}/../savings/scripts/savings.mjs" guard`

## One setting

Take the first step whose answer the request and the digits so far leave open.

1. **Relay** the `show` block above as the whole reply when the request only asks to see the settings, and run nothing. Keep its ```` ```text ```` fence unchanged, because the rows line up only in a monospace block.
2. **Pick the setting** when the request names none: run `node "${CLAUDE_SKILL_DIR}/scripts/settings.mjs" menu` and relay its output unchanged as the whole reply, because the user answers it with a digit.
3. **Ask the value** once the setting is known but no value: for `specs`, `replies` or `interview` run `node "${CLAUDE_SKILL_DIR}/scripts/settings.mjs" menu <key>` and relay it the same way; for `counter` or `guard` ask `on` or `off`, and for `guard-lines` a whole number of at least 1, in the shape `## A question` in `using-exo` gives.
4. **Ask the layer** for `specs`, `replies` or `interview` once setting and value are known but no layer; the savings switches hold for this machine and take none:
   ```text
   1. **Project (Recommended)**: everyone, via .claude/exo.json
   2. **Local**: only you, in this repository
   3. **Global**: every project on this machine
   ```
5. **Write** with the command `## The write commands` names, then run `show`, or `savings.mjs guard` for a savings switch, and relay it under the script's confirmation line, because the block above predates the change. Relay a rejection as the script printed it and change nothing by hand.
6. **Point** a global value at `/config`, where each exo option is a row, and run nothing, because the harness owns that file.

A project value adds one line under the fence: collaborators receive it once `.claude/exo.json` is committed. The ladder has no switch, so a request to switch it off gets that answer and runs nothing.

## The walk

1. **Check the issue route.** Run `git remote get-url origin` and `gh auth status`. Offer `issues` and `both` only when origin is on GitHub and both pass, because either answer fails at the first spec otherwise.
2. **Write the map** that `references/setup-map.md` describes, in the user's language. Each setting's first answer keeps its current value and is the recommended one, so Go keeps every setting still open.
3. **Serve the page once** under the Bash tool's `run_in_background`: `node "${CLAUDE_SKILL_DIR}/../shaping/scripts/question-page.mjs" --serve "$RUN/questions" --map "$RUN/map.json" 2> "$RUN/page.log"`.
4. **Ask in rounds** with `node "${CLAUDE_SKILL_DIR}/../shaping/scripts/question-page.mjs" --ask "$RUN/questions" --map "$RUN/map.json" > "$RUN/answer.json"`. A round asks every open setting. After each answer, close each answered setting as `you` with its `round`, open the settings that waited on one just closed, raise `round`, rewrite the map and ask again. A `go` answer closes every open setting on its keep answer.
5. **Close what the counter decides.** A counter answered `off` closes the guard and its line limit as `exo`, because the counter's off switch stops the guard as well.
6. **Fall back to the chat** on exit 3, and at once when a step before it cannot run, such as a denied map write or no browser to open: ask each remaining setting in its own message, in the shape `## A question` in `using-exo` gives, and never pick an answer for the user. Exit 2 names the map field to repair.
7. **Review before writing.** With every setting closed, write the map with no open setting and ask once more: `done` confirms, and `reopen` or typed words return the settings they name as the next round. In the chat, list the changes and wait for a yes.
8. **Write only the changes, then report.** Use the commands below, and on a rejection relay it as printed and write nothing after it, because the user confirmed the set as a whole. Report one line per changed value and where it now lives.

## The write commands

| Setting | Command |
|---|---|
| `specs`, `replies`, `interview` for this repository | `node "${CLAUDE_SKILL_DIR}/scripts/settings.mjs" set <key> <value> --scope <project or local>` |
| `specs`, `replies`, `interview` for every project | None: the harness owns that file. The report names the value to pick for that key under exo in `/config`. |
| The savings counter, `counter` | `node "${CLAUDE_SKILL_DIR}/../savings/scripts/savings.mjs" on` or `off` |
| The read guard, `guard` | `node "${CLAUDE_SKILL_DIR}/../savings/scripts/savings.mjs" guard on` or `guard off` |
| The line limit, `guard-lines` | `node "${CLAUDE_SKILL_DIR}/../savings/scripts/savings.mjs" guard-lines <lines>` |

## References

| File | Read it when |
|---|---|
| `references/setup-map.md` | The walk's step 2, to write the map with each setting's question and answers. |

## Judgment

- The scripts' output outranks any value in the context, including the session's `exo settings:` line, which was read when the session started.
- A setting, value or layer the request names outranks its question, and a named layer outranks the recommended one.
- A value the user kept in the walk is never written, even when it equals the default.
- A project or local value outranks a global one: when the user picks every project for a key such a layer holds, the report names that layer, because the new value stays hidden there.
- The user's typed words outrank the click they came with.
- The counter's `off` stops the status line segment and the read guard with it; `guard off` stops the guard alone, and the right-sizing ladder rides in every session either way.
