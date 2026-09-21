---
name: setup
description: Use when the user runs /exo:setup or asks to set up, personalize or configure exo as a whole, walking through every setting at once. Not for one setting, which settings owns, and not for the savings figures, which savings reports.
disable-model-invocation: true
allowed-tools: Bash(node *settings.mjs*), Bash(node *savings.mjs*), Bash(node *question-page.mjs*), Bash(git remote get-url origin), Bash(git rev-parse *), Bash(gh auth status)
model: sonnet
---

# Setup

Walk the user through every exo setting on one clickable page and save only what they changed. The enemy is a setup that writes a value the user never confirmed, or overwrites one they meant to keep. The overcorrection is a wizard that makes the user choose again what already suits them: keeping the current value is always the first answer.

## When to use

- The user runs `/exo:setup`, or asks to set up or personalize exo as a whole.
- Not for one setting: `settings` shows and changes it.
- Not for the savings figures: `savings` reports them.

## Where things stand

The values when this skill loaded, each with the layer it came from:

!`node "${CLAUDE_SKILL_DIR}/../settings/scripts/settings.mjs" show`

The savings counter:

!`node "${CLAUDE_SKILL_DIR}/../savings/scripts/savings.mjs" status`

The read guard and its line limit:

!`node "${CLAUDE_SKILL_DIR}/../savings/scripts/savings.mjs" guard`

## The loop

1. **Check the issue route.** Run `git remote get-url origin` and `gh auth status`. Offer `issues` and `both` only when origin is on GitHub and both pass, because either answer fails at the first spec otherwise.
2. **Write the map** that `references/setup-map.md` describes, in the user's language. Each setting's first answer keeps its current value and is the recommended one, so Go keeps every setting still open.
3. **Serve the page once** under the Bash tool's `run_in_background`: `node "${CLAUDE_SKILL_DIR}/../shaping/scripts/question-page.mjs" --serve "$RUN/questions" --map "$RUN/map.json" 2> "$RUN/page.log"`.
4. **Ask one setting at a time** with `node "${CLAUDE_SKILL_DIR}/../shaping/scripts/question-page.mjs" --ask "$RUN/questions" --map "$RUN/map.json" > "$RUN/answer.json"`. After each answer, close that setting as `you`, point `asked` at the next open one, rewrite the map and ask again. A `go` answer closes every open setting on its keep answer.
5. **Close what the counter decides.** A counter answered `off` closes the guard and its line limit as `exo`, because the counter's off switch stops the guard as well.
6. **Fall back to the chat** on exit 3: ask each remaining setting in its own message, in the shape `## A question` in `using-exo` gives, and never pick an answer for the user. Exit 2 names the map field to repair.
7. **Review before writing.** With every setting closed, write the map with `asked` as `null` and ask once more: `done` confirms, and typed words reopen the setting they name. In the chat, list the changes and wait for a yes.
8. **Write only the changes, then report.** Use the commands below, and on a rejection relay it as printed and write nothing after it, because the user confirmed the set as a whole. Report one line per changed value and where it now lives.

## The write commands

| Setting | Command |
|---|---|
| `specs`, `replies`, `interview` for this repository | `node "${CLAUDE_SKILL_DIR}/../settings/scripts/settings.mjs" set <key> <value> --scope <project or local>` |
| `specs`, `replies`, `interview` for every project | None: the harness owns that file. The report names the value to pick for that key under exo in `/config`. |
| The savings counter | `node "${CLAUDE_SKILL_DIR}/../savings/scripts/savings.mjs" on` or `off` |
| The read guard | `node "${CLAUDE_SKILL_DIR}/../savings/scripts/savings.mjs" guard on` or `guard off` |
| The line limit | `node "${CLAUDE_SKILL_DIR}/../savings/scripts/savings.mjs" guard-lines <lines>` |

## References

| File | Read it when |
|---|---|
| `references/setup-map.md` | Before step 2, to write the map with each setting's question and answers. |

## Judgment

- A value the user kept is never written, even when it equals the default.
- A project or local value outranks a global one: when the user picks every project for a key such a layer holds, the report names that layer, because the new value stays hidden there.
- The user's typed words outrank the click they came with.
- The scripts' output outranks the values above, which predate every change.
