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

Every setting but `scope` offers its current value first, as `- **A · Keep <value>**: <what it gives>`, naming the layer the `show` block printed for it, then every other value below.

| Setting | Question | Values and what each gives |
|---|---|---|
| `specs` | Where should a spec go when exo shapes a change? | `docs`: a file under docs/specs in the repository. `issues`: a GitHub issue. `both`: a file plus a linked issue. |
| `replies` | How should exo write its replies? | `terse`: chat prose without articles, linking verbs or filler. `tight`: short, no preamble, recap or filler. `standard`: full prose. |
| `budget` | Which model should each agent run on? | `high`: medium, except the deep branch review, the design critique and the hardest work run their `xhigh` twins. `medium` (default): each agent runs the model its kind resolves to. `low`: an agent on a tier with a cheaper replacement runs on that replacement, except the hardest work, which runs at medium effort. |
| `workspace` | Where should a code-changing run commit? | `ask`: the run asks each time. `branch`: a new branch. `worktree`: a separate folder. `current`: the current branch. |
| `ship` | How should finished commits leave this machine? | `ask`: ship asks each time. `pr-merge`: a pull request, merged once checks pass. `open-pr`: a pull request left open. `push`: a push, no pull request. `local`: nothing leaves. |
| `guards` | Should exo's safety guards refuse the commands and edits they cover? | `on` (default): they refuse. `off`: no guard refuses anything. |
| `guard_lines` | From how many lines is a file big? | `200`, `400` (the default) and `800`, each: files over that many lines count as big. A typed whole number of at least 1 is also an answer. |
| `heavy_commands` | Which commands should run at most once per code state? | Empty (the default): no command is held back. Typed command prefixes separated by `;`, such as `npm run e2e`: a repeat on unchanged code returns the earlier green result. Any typed string is an answer. |
| `heavy_after_seconds` | After how many seconds is a test command heavy? | `30`, `60` (the default) and `120`, each: a test-like command whose last run in this project took longer counts as heavy. `0`: off. A typed whole number of at least 0 is also an answer. |

`issues` and `both` are left out when step 1 found no working GitHub route. A value that is the current one appears only as the keep answer.

## Judgment

- The current value outranks the default as the recommended answer.
- An answer the scripts reject is never offered, even when the user typed it: ask that setting again with the accepted values.
- The user's typed words outrank the letter they came with.
