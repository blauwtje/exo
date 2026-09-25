---
name: configure
description: Use when the user asks to set up or configure exo, or to see or change one exo setting, such as where specs go, the savings counter or the read guard, for every project, one repository or this machine. Not for the harness's own settings.json, permissions or hooks.
argument-hint: "[nothing to walk every setting, or a key, a value and --scope project|local]"
allowed-tools: Bash(node *settings.mjs*), Bash(node *savings.mjs*), Bash(node *question-page.mjs*), Bash(git remote get-url origin), Bash(git rev-parse *), Bash(gh auth status)
model: sonnet
---

# Settings

Change exo's settings only through its own scripts, one named setting or every setting in one walk. The enemy is a value the user never picked: a guessed layer, or a walk that writes before its review. The overcorrection is a walk through every setting when the request named one.

## When to use

- `/exo:configure` with nothing after it, or a request to set up or configure exo as a whole: take `## The walk`.
- A question about one setting, or a request to change one: take `## One setting`.
- Not for the savings figures, which `show-savings` reports.

## Where things stand

The values when this skill loaded, each with its layer:

!`node "${CLAUDE_SKILL_DIR}/scripts/settings.mjs" show`

The savings counter, then the read guard and its line limit:

!`node "${CLAUDE_SKILL_DIR}/../show-savings/scripts/savings.mjs" status`

!`node "${CLAUDE_SKILL_DIR}/../show-savings/scripts/savings.mjs" guard`

## One setting

Take the first step whose answer the request and the digits so far leave open.

1. **Relay** the `show` block above as the whole reply when the request only asks to see the settings, and run nothing. Keep its ```` ```text ```` fence unchanged, because the rows line up only in a monospace block.
2. **Pick the setting** when the request names none: run `node "${CLAUDE_SKILL_DIR}/scripts/settings.mjs" menu` and relay its output unchanged as the whole reply, because the user answers it with a digit.
3. **Ask the value** once the setting is known but no value: for a key whose `show` row lists options, run `node "${CLAUDE_SKILL_DIR}/scripts/settings.mjs" menu <key>` and relay it the same way; for `counter` or `guard` ask `on` or `off`, and for `guard-lines` or a key without options a whole number of at least 1, in the question shape.
4. **Ask the layer** for a key `show` lists once setting and value are known but no layer; the savings switches hold for this machine and take none:
   ```text
   1. **Project (Recommended)**: everyone, via .claude/exo.json
   2. **Local**: only you, in this repository
   3. **Global**: every project on this machine
   ```
5. **Write** with the command `## The write commands` names, then run `show`, or `savings.mjs guard` for a savings switch, and relay it under the script's confirmation line, because the block above predates the change. Relay a rejection as the script printed it and change nothing by hand.
6. **Point** a global value at `/config`, where each exo option is a row, and run nothing, because the harness owns that file.

A project value adds one line under the fence: collaborators receive it once `.claude/exo.json` is committed. The ladder has no switch, so a request to switch it off gets that answer and runs nothing.

## The walk

Follow `references/setup-map.md` from its first step, running its `<page>` as `node "${CLAUDE_SKILL_DIR}/../define-scope/scripts/question-page.mjs"`. Offer `issues` and `both` only when `git remote get-url origin` is on GitHub and `gh auth status` passes, because either answer fails at the first spec otherwise. Never pick an answer for the user. Write nothing before the review is confirmed, then only the changed values: a kept value is never written, even when it equals the default, and a rejection stops every write after it.

## The write commands

| Setting | Command |
|---|---|
| A key `show` lists, for this repository | `node "${CLAUDE_SKILL_DIR}/scripts/settings.mjs" set <key> <value> --scope <project or local>` |
| A key `show` lists, for every project | None: the harness owns that file. The report names the value to pick for that key under exo in `/config`. |
| The savings counter, `counter` | `node "${CLAUDE_SKILL_DIR}/../show-savings/scripts/savings.mjs" on` or `off` |
| The read guard, `guard` | `node "${CLAUDE_SKILL_DIR}/../show-savings/scripts/savings.mjs" guard on` or `guard off` |
| The line limit, `guard-lines` | `node "${CLAUDE_SKILL_DIR}/../show-savings/scripts/savings.mjs" guard-lines <lines>` |

## References

| File | Read it when |
|---|---|
| `references/setup-map.md` | The walk, before its first step: every step, the page map, each setting's question and answers, and the chat fallback. Not for one setting. |
| `../route-skills/references/question.md` | Before a message that asks the user to pick among numbered options. |

## Judgment

- The scripts' output outranks any value in the context, including the session's `exo settings:` line, which was read when the session started.
- A setting, value or layer the request names outranks its question, and a named layer outranks the recommended one.
- A project or local value outranks a global one: when the user picks every project for a key such a layer holds, the report names that layer, because the new value stays hidden there.
- The counter's `off` stops the status line segment and the read guard with it; `guard off` stops the guard alone, and the right-sizing ladder rides in every session either way.
