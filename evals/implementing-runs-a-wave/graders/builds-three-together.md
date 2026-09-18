---
type: llm
criteria: 'The run builds Task 2, Task 3 and Task 4 together: it creates one worktree for each of the three, runs `npm ci` inside each, and sends three build dispatches at once, each told to work in its own worktree. Task 5 waits for a later round. The session holds no checkout and no write tool, so the commands are named, not executed, and saying so does not fail it. A response that dispatches Task 2 alone, dispatches four tasks, builds any of the three in the branch checkout, tells a delegate to create its own worktree, or asks the user whether to run tasks together fails.'
---

Passes when three independent tasks start together, each in a worktree the run made, and the fourth ready task waits.
