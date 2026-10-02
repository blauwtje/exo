# Cheat sheet

Ordered by how often people use each skill; **type it** marks a skill the model never runs on its own, so typing the exact command is the only way in.

| Skill | What it does | Just say instead |
|---|---|---|
| `start` **type it** | Shows this table, or picks the one skill for a stated goal | Type `/exo:start` when no skill name comes to mind |
| `edit-skills` | Writes or improves a skill or agent | "fix skill X", "make an agent that ..." |
| `design-ui` | Designs or improves how a screen looks | "make this page nicer", "new component" |
| `build` | Runs a plan file, with helpers and review, or with no plan file, builds a decided change test-first where it can | "run the plan at docs/...", or after `/clear`: "carry on", or "build X", "fix this bug, here's how to reproduce it" |
| `verify` | Runs the scripted gate, reviews the branch and repairs its findings | "verify the plan at docs/...", "verify the branch for the plan at docs/..." |
| `ship` | Pushes, opens or merges a pull request, fixes its checks or review comments | "push this", "merge the PR", "fix the checks" |
| `spec` | Decides what "done" means, when that is still open | "I want something for X but I'm not sure what exactly" |
| `spec` then `build` | Writes the brief with its task list, then offers to build it | "I have a spec or a big wish: build it", or type `/exo:start <spec-path>` |
| `write-docs` | Writes a README, docs page, PR or commit text | "write the README", "PR description" |
| `find-cause` | Finds the real cause of a failure before fixing it | "this doesn't work", "why does X crash?" |
| `refactor` | Restructures code without changing its behavior | "rename X", "move Y", "split this module" |
| `save-session` **type it** | Saves where a session is, for a fresh one after `/clear` | Type `/exo:save-session`, then `/clear` |
| `file-issues` | Files GitHub issues | "turn this into issues" |
| `configure` | Shows or changes an exo setting | "set replies to standard" |
| `remember` **type it** | Books a correction about this repository | Type `/exo:remember` |

## Rarely

Skills for a case most sessions never hit; still worth knowing about.

| Skill | What it does | Just say instead |
|---|---|---|
| `check-docs` | Checks how a pinned library, API or service actually behaves | "does this still hold for version X of Y?" |
