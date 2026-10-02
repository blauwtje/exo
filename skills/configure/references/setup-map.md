# Setup walk

## The steps

1. **Check the issue route.** Run `git remote get-url origin` and `gh auth status`. Offer `issues` and `both` only when origin is on GitHub and both pass, because either answer fails at the first spec otherwise.
2. **Ask each setting in its own message**, in the order `## The order` sets and in the question shape.
3. **Review before writing.** List the changes, one line each, and wait for a yes. A setting named in the answer is asked again, then the review follows once more.
4. **Write only the changes, then report.** Use the commands under `## The write commands` in the skill; a kept value is never written, even when it equals the default.
   - On a rejection, relay it as printed and write nothing after it, because the user confirmed the set as a whole.
   - Report one line per changed value and where it now lives.

## The order

`scope`, `specs`, `replies`, `budget`, `workspace`, `ship`, `guards`, `guard_lines`, `heavy_commands`, `heavy_after_seconds`. `scope` decides the layer for every setting after it.

| Option of `scope` | What it gives |
|---|---|
| `global`, Every project | The choice holds everywhere; the user confirms it once in `/config`. |
| `project`, This repository, for everyone | Everyone who clones it gets it once `.claude/exo.json` is committed. |
| `local`, This repository, only me | Only the user, only here; the file stays out of git. |

## Each setting

Ask each setting with the plain texts its entry in `../schema.json` holds, never its key, because the user picks from what each answer gives.

- The title is its `question`; a `typed` line, when present, is the context.
- The first option is the current value, as `- **(A) Keep <label>**: <gives>` from its `choices` entry, because a recommended answer that changes a value turns the answer `a` into a change the user never read; a value with no entry shows as written.
- Every other `choices` entry follows as `- **(<letter>) <label>**: <gives>`, then `Keep the rest`, which keeps every setting not yet asked.
- `scope` has no `Keep the rest`.
- An unset `guard_lines` shows `400` (the default) as its current value.

A value that is the current one appears only as the keep answer.

## Judgment

- An answer the scripts reject is never offered, even when the user typed it: ask that setting again with the accepted values.
- The current value outranks the default as the recommended answer.
- The user's typed words outrank the letter they came with.
