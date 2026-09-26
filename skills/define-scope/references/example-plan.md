# Example plan

A compact plan reads exactly as the checker expects it. The enemy is an example that keeps a `Run:` step or a `Commit:` block for clarity. The overcorrection is a plan so bare it drops a required field or a checkpoint point.

## Goal
A task row shows a colored badge for its due date.

## Plan basis
Repository: /repo
Branch: due-date-badge
Worktree setup: none

## Success criterion
`npm test -- task-row` passes and the badge renders in the app's task list.

## Checkpoint
- Blocks first: Task 1.
- Parallel: Tasks 2 and 3, once Task 1 lands.
- Shared state: none.
- Smallest safe split: one task per file.
## Tasks
### Task 1: feat(tasks): add a dueDate field to the task record
Depends on: none | Files: `src/tasks/task.js`, `src/tasks/task.test.js` | Data: an ISO-8601 string on the existing task object | Proof: npm test -- task.test
### Task 2: feat(tasks): render a due-date badge on each task row
Depends on: 1 | Files: `src/tasks/task-row.jsx`, `src/tasks/task-row.css` | Data: a `{ label, tone }` object derived from `dueDate` | Design: design-ui | Proof: npm test -- task-row
### Task 3: test(tasks): cover an overdue task's badge tone
Depends on: 1 | Files: `src/tasks/task-row.test.jsx` | Data: none, assertions only | Proof: npm test -- task-row.test
## Judgment
- When this example and this skill's plan specification disagree, the specification wins and this file is the one to fix.
- A field left out here for brevity would be a field left out of a real plan; nothing is left out.
