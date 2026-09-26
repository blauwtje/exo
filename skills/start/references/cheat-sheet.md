# Cheat sheet

Every exo skill in one table, so a name never has to be remembered. The enemy is a list so long nobody reads it before falling back to doing the work by hand. The overcorrection is a table that buries the skill someone actually needs under six they open once a year.

Ordered by how often people use each skill; **type it** marks a skill the model never runs on its own, so typing the exact command is the only way in.

| Skill | What it does | Just say instead |
|---|---|---|
| `start` **type it** | Shows this table, or picks the one skill for a stated goal | Type `/exo:start` when no skill name comes to mind |
| `edit-skills` | Writes or improves a skill or agent | "fix skill X", "make an agent that ..." |
| `design-ui` | Designs or improves how a screen looks | "make this page nicer", "new component" |
| `build-change` | Builds a decided change, test-first where it can | "build X", "fix this bug, here's how to reproduce it" |
| `run-plan` | Runs a plan file, with helpers and review | "run the plan at docs/...", or after `/clear`: "carry on" |
| `ship` | Pushes, opens or merges a pull request, fixes its checks or review comments | "push this", "merge the PR", "fix the checks" |
| `define-scope` | Decides what "done" means, when that is still open | "I want something for X but I'm not sure what exactly" |
| `write-docs` | Writes a README, docs page, PR or commit text | "write the README", "PR description" |
| `check-impact` | Says what a change could break, with evidence | "is this safe to merge?", "what does this break?" |
| `find-cause` | Finds the real cause of a failure before fixing it | "this doesn't work", "why does X crash?" |
| `explain-code` | Explains how or why code works the way it does | "how does X work?", "why is this built this way?" |
| `refactor` | Restructures code without changing its behavior | "rename X", "move Y", "split this module" |
| `save-session` **type it** | Saves where a session is, for a fresh one after `/clear` | Type `/exo:save-session`, then `/clear` |
| `show-savings` | Shows how many tokens exo saved | "what did exo save?" |
| `file-issues` | Files GitHub issues | "turn this into issues" |
| `configure` | Shows or changes an exo setting | "set context to 120" |
| `remember` **type it** | Books a correction about this repository | Type `/exo:remember` |

## Rarely

Skills for a case most sessions never hit; still worth knowing about.

| Skill | What it does | Just say instead |
|---|---|---|
| `check-docs` | Checks how a pinned library, API or service actually behaves | "does this still hold for version X of Y?" |
| `try-idea` | Builds a throwaway prototype to find out | "try whether ...", "proof of concept" |
| `audit-architecture` | Finds where the architecture should change | "where's the tech debt?" |
| `compare-renders` **type it** | Proves screens stayed pixel-identical after a refactor | Type `/exo:compare-renders` |
| `run-parallel` **type it** | Hands one job to parallel helpers | Type `/exo:run-parallel` |
| `tune-metric` **type it** | Pushes one metric up in a loop that reverts itself | Type `/exo:tune-metric` |

## Judgment

- A skill that only runs when typed outranks its description as the answer: tell the user the command instead of guessing they meant it.
- The main table outranks the rarely-needed one when a goal could fit either: the common skill is the likelier match.
