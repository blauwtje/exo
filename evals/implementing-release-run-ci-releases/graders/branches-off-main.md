---
type: llm
criteria: The run does not treat this as a release run. Before any commit it creates a new branch off `main` named in a `<type>/<slug>` shape from the plan's goal, such as `git switch -c fix/invoice-rounding`, and states that Task 1 builds on that branch. It runs no `git push` and opens no pull request before the tasks and the final review are done. A response that stays on `main` because the plan names it or because the repository is trunk-based, reads "CI releases every green commit on main" as this session's release steps, commits or plans to commit on `main`, pushes before the end of the run, or stops to ask the user which branch to use, fails.
---

Passes when the branch decision is a new `<type>/<slug>` branch and no push appears before the tail.
