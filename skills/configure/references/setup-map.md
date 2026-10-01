# Setup walk

Walk every setting in the chat, one question per message, and write only what the user changed once the review confirms. The enemy is a recommended answer that changes a value, which turns the answer `a` into a change the user never read. The overcorrection is an answer the scripts would reject: offer only the values each script accepts.

## Contents

- [The steps](#the-steps)
- [The order](#the-order)
- [Each setting](#each-setting)
- [Judgment](#judgment)

## The steps

1. **Check the issue route.** Run `git remote get-url origin` and `gh auth status`. Offer `issues` and `both` only when origin is on GitHub and both pass, because either answer fails at the first spec otherwise.
2. **Ask each setting in its own message**, in the order `## The order` sets and in the question shape, because the user answers each with one letter. The last option of every setting but `scope` is `Keep the rest`, which keeps every setting not yet asked.
3. **Review before writing.** List the changes, one line each, and wait for a yes; a named setting in the answer is asked again, then the review follows once more.
4. **Write only the changes, then report.** Use the commands under `## The write commands` in the skill, and on a rejection relay it as printed and write nothing after it, because the user confirmed the set as a whole. Report one line per changed value and where it now lives.

## The order

`scope`, `specs`, `replies`, `budget`, `workspace`, `ship`, `guards`, `guard_lines`, `heavy_commands`, `heavy_after_seconds`. `scope` decides the layer for `specs`, `replies`, `budget`, `workspace`, `ship`, `guards`, `guard_lines`, `heavy_commands` and `heavy_after_seconds`.

| Option of `scope` | What it gives |
|---|---|
| `global`, Every project | The choice holds everywhere; the user confirms it once in `/config`. |
| `project`, This repository, for everyone | Everyone who clones it gets it once `.claude/exo.json` is committed. |
| `local`, This repository, only me | Only the user, only here; the file stays out of git. |

## Each setting

Ask each setting with the plain texts its entry in `../schema.json` holds, never its key or a model, effort or file name, because the user picks from what each answer gives.

- The title is its `question`; a `typed` line, when present, is the context.
- The first option is the current value, as `- **(A) Keep <label>**: <gives>` from its `choices` entry; a value with no entry shows as written.
- Every other `choices` entry follows as `- **(<letter>) <label>**: <gives>`, then `Keep the rest`.
- A typed answer also counts: for `guard_lines` a whole number of at least 1, `400` (the default) when unset; for `heavy_after_seconds` one of at least 0; for `heavy_commands` command prefixes joined by `;`.

`issues` and `both` are left out when step 1 found no working GitHub route. A value that is the current one appears only as the keep answer.

## Judgment

- The current value outranks the default as the recommended answer.
- An answer the scripts reject is never offered, even when the user typed it: ask that setting again with the accepted values.
- The user's typed words outrank the letter they came with.
