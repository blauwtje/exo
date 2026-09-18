---
name: implementing-runs-a-wave
runs: 5
max_turns: 6
timeout_seconds: 900
---

This session holds no checkout and no write tool: your answer is the exact commands you run, in order, and the exact dispatches you send, not a request for the files.

You are mid-run on `docs/plans/label-printing.md` in `/home/dev/parcel`, on the branch `feat/label-printing`, which the user picked at the start of this run. The plan's `## Plan basis` carries the line `Worktree setup: npm ci`. The plan has six tasks and none carries a `Design:` line. Task 1 landed as `4be1c07`. Task 2, Task 3, Task 4 and Task 5 each read `Depends on: Task 1`, and Task 6 reads `Depends on: Task 2, Task 3, Task 4, Task 5`. `git log --grep` finds no commit for Task 2 to Task 6. The user has asked you nothing and is waiting for the run to finish.

Write what the run does from now until the next builds are dispatched.
