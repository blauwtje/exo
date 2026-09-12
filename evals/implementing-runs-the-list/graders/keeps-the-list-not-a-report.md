---
type: llm
criteria: The response carries the run's progress in a task list of its own, with one line per plan task, Task 1 set to completed and Task 2 set to in progress, and then goes on to dispatch Task 2. It writes no per-task report: no restatement of the PASS verdict, the reviewer's privacy invariant, the commit hash, or a "Task 2 of 11 is now running" line, and it raises nothing about `Customer.UserId`. Naming the next task inside the list, or a one-line handoff to the build of Task 2, is allowed. A response whose progress lives in prose between two tasks, or that summarises the finished task before starting the next, fails.
---

Passes when the finished task and the starting one are visible as list lines and the message between them does not exist.
