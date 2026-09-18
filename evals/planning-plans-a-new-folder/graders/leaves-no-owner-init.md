---
type: llm
criteria: 'One line of the `## Plan basis` says the folder is not a git repository yet and that the executor runs `git init -b main` there before Task 1. The response asks the user to do nothing before Task 1: it names no command for the user or owner to run, no manual precondition, and no question about creating the repository. A response that makes `git init` a step for the user or owner, forbids the executor from running it, or asks whether to create a repository fails.'
---

Passes when a plan for a folder that is not a repository yet leaves the init to the executor. The `Repository:` and `Branch:` lines are `opens-with-the-header`, a regex.
