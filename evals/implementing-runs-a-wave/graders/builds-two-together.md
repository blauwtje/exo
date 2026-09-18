---
type: llm
criteria: 'The run builds Task 2 and Task 3 together: it creates one worktree for each of the two, runs `npm ci` inside each, and sends two build dispatches at once, each told to work in its own worktree. Task 4 and Task 5 wait for a later round. The session holds no checkout and no write tool, so the commands are named, not executed, and saying so does not fail it. A response that dispatches Task 2 alone, dispatches three or more tasks, builds either task in the branch checkout, tells a delegate to create its own worktree, or asks the user whether to run tasks together fails.'
---

Passes when two independent tasks start together, each in a worktree the run made, and the other ready tasks wait.
