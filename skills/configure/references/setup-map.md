# Setup walk

## The steps

1. **Check the issue route.** Run `git remote get-url origin` and `gh auth status`. Offer `issues` and `both` only when origin is on GitHub and both pass; otherwise either answer fails at the first spec.
2. **Ask each setting** in `## The order`, as `## Each setting` says.
3. **Review before writing.** List the changes, one line each, and wait for a yes. When an answer names a setting, ask it again, then review once more.
4. **Write only the changes, then report.** Use the commands under `## The write commands` in the skill.
   - Leave a kept value unwritten, even when it equals the default.
   - When the script rejects a value, write nothing after it, because the user confirmed the set as a whole.
   - Report one line per changed value and where it now lives.

## The order

`scope`, `specs`, `budget`, `workspace`, `ship`. `scope` decides the layer for every setting after it.

| Option of `scope` | What it gives |
|---|---|
| `global`, Every project | The choice holds everywhere; the user confirms it once in `/config`. |
| `project`, This repository, for everyone | Everyone who clones it gets it once `.claude/exo.json` is committed. |
| `local`, This repository, only me | Only the user, only here; the file stays out of git. |

## Each setting

Ask each setting in its own message, relaying `settings.mjs menu <key>` unchanged; its A/B/C layout and `Or type` line are the question shape. Add `rest` to keep the rest to the `Or type` line.

- `Keep the rest` keeps every setting not yet asked; `scope` has none.

## Judgment

- Offer no answer the scripts reject, even when the user typed it: ask that setting again with the accepted values.
