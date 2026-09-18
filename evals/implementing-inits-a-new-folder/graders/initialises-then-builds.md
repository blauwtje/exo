---
type: llm
criteria: 'The run executes `git init -b main` in `/home/dev/sinter` itself, before any dispatch, and then goes on to Task 1: it extracts Task 1 or dispatches its build in this turn. It asks the user no workspace question, because a repository with no commit has nothing to branch from, and asks no permission to initialise. A response that stops before Task 1, tells the user to run `git init`, asks whether to create the repository, offers a branch or worktree choice, or pushes anything fails.'
---

Passes when the run initialises the docs-only folder itself and reaches Task 1.
