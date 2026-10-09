# Setup walk

## The steps

1. **Check the issue route.** Run `git remote get-url origin` and `gh auth status`. Offer `issues` and `both` only when origin is on GitHub and both pass; otherwise either answer fails at the first spec.
2. **Ask each setting in its own message**, in `## The order`, in the question shape.
3. **Review before writing.** List the changes, one line each; wait for a yes. Answer names a setting → ask it again, then review once more.
4. **Write only the changes, then report.** Use the commands under `## The write commands` in the skill.
   - Never write a kept value, even when it equals the default.
   - Rejection → relay it as printed, write nothing after it; the user confirmed the set as a whole.
   - Report one line per changed value and where it now lives.

## The order

`scope`, `specs`, `compression`, `budget`, `workspace`, `ship`, `guards`. `scope` decides the layer for every setting after it.

| Option of `scope` | What it gives |
|---|---|
| `global`, Every project | The choice holds everywhere; the user confirms it once in `/config`. |
| `project`, This repository, for everyone | Everyone who clones it gets it once `.claude/exo.json` is committed. |
| `local`, This repository, only me | Only the user, only here; the file stays out of git. |

## Each setting

Ask each setting with the plain texts its entry in `../schema.json` holds, never its key; the user picks from what each answer gives.

- The title is its `question`; a `typed` line, when present, is the context.
- First option = current value, as `- **(A) Keep <label>**: <gives>` from its `choices` entry; a recommended answer that changed a value would turn `a` into a change the user never read. Value with no entry → shown as written.
- Every other `choices` entry follows as `- **(<letter>) <label>**: <gives>`, then `Keep the rest`, which keeps every setting not yet asked.
- `scope` has no `Keep the rest`.

## Judgment

- Never offer an answer the scripts reject, even when the user typed it: ask that setting again with the accepted values.
- The user's typed words outrank the letter they came with.
