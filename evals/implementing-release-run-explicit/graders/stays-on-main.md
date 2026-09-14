---
type: llm
criteria: The run treats this as a release run. It stays on `main`, creates no feature branch, and states that Task 1 builds and commits on `main`. It pushes nothing before the tasks, the final review and the repository's release steps, and it plans no pull request and no pull-request question. A response that creates a feature branch, plans a pull request, pushes after a single task, or stops to ask the user which branch to use, fails.
---

Passes when the branch decision is to stay on `main` as a release run and the only push named is inside the release steps.
