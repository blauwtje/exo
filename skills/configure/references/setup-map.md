# Setup walk

Walk every setting in the chat, one question per message, and write only what the user changed once the review confirms. The enemy is a recommended answer that changes a value, which turns a digit `1` into a change the user never read. The overcorrection is an answer the scripts would reject: offer only the values each script accepts.

## Contents

- [The steps](#the-steps)
- [The order](#the-order)
- [Each setting](#each-setting)
- [Judgment](#judgment)

## The steps

1. **Check the issue route.** Run `git remote get-url origin` and `gh auth status`. Offer `issues` and `both` only when origin is on GitHub and both pass, because either answer fails at the first spec otherwise.
2. **Ask each setting in its own message**, in the order `## The order` sets and in the question shape, because the user answers each with one digit. The last option of every setting but `scope` is `Keep the rest`, which keeps every setting not yet asked.
3. **Close what the counter decides.** A counter answered `off` skips the guard and its line limit, because the counter's off switch stops the guard as well.
4. **Review before writing.** List the changes, one line each, and wait for a yes; a named setting in the answer is asked again, then the review follows once more.
5. **Write only the changes, then report.** Use the commands under `## The write commands` in the skill, and on a rejection relay it as printed and write nothing after it, because the user confirmed the set as a whole. Report one line per changed value and where it now lives.

## The order

`scope`, `specs`, `replies`, `counter`, `guard`, `guardLines`. `scope` decides the layer for `specs` and `replies`; the savings switches hold for this machine and take none.

| Option of `scope` | What it gives |
|---|---|
| `global`, Every project (Recommended) | The choice holds everywhere; the user confirms it once in `/config`. |
| `project`, This repository, for everyone | Everyone who clones it gets it once `.claude/exo.json` is committed. |
| `local`, This repository, only me | Only the user, only here; the file stays out of git. |

## Each setting

Every setting but `scope` offers its current value first, as `1. **Keep <value> (Recommended)**: <what it gives>`, naming the layer the `show` block printed for it, then every other value below.

| Setting | Question | Values and what each gives |
|---|---|---|
| `specs` | Where should a spec go when exo shapes a change? | `docs`: a file under docs/specs in the repository. `issues`: a GitHub issue. `both`: a file plus a linked issue. |
| `replies` | How should exo write its replies? | `tight`: short, no preamble, recap or filler. `standard`: full prose. |
| `counter` | Should exo count what it costs? | `on`: the cost shows in the status line. `off`: no counting, no status line segment and no read guard. |
| `guard` | Should exo refuse to read a big file whole? | `on`: it reads the part it needs. `off`: any file may be read whole. |
| `guardLines` | From how many lines is a file big? | `200`, `400` (the default) and `800`, each: files over that many lines count as big. A typed whole number of at least 1 is also an answer. |

`issues` and `both` are left out when step 1 found no working GitHub route. A value that is the current one appears only as the keep answer.

## Judgment

- The current value outranks the default as the recommended answer.
- An answer the scripts reject is never offered, even when the user typed it: ask that setting again with the accepted values.
- The user's typed words outrank the digit they came with.
