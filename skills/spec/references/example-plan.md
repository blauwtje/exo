# Example plan

A compact plan reads exactly as the checker expects it. The enemy is an example that keeps a `Run:` step or a `Commit:` block for clarity. The overcorrection is a plan so bare it drops a required field or a checkpoint point.

## Goal
A task row shows a colored badge for its due date.

## Manual checks
- A task due tomorrow shows its badge in the app's task list.

## Plan basis
Repository: /repo
Branch: due-date-badge
Worktree setup: none

## Success criterion
`npm test` passes.

## Checkpoint
- Blocks first: none.
- Parallel: Tasks 1 and 2.
- Shared state: none.
- Smallest safe split: one task per module, each with its own test.
## Tasks
### Task 1: feat(tasks): add a dueDate field to the task record
Depends on: none | Files: `src/tasks/task.js`, `src/tasks/task.test.js` | Data: an ISO-8601 string on the existing task object | Proof: npm test -- task.test
### Task 2: feat(tasks): derive a badge tone from a due date
Depends on: none | Files: `src/tasks/due-tone.js`, `src/tasks/due-tone.test.js` | Data: a `{ label, tone }` object computed from an ISO-8601 string | Proof: npm test -- due-tone
### Task 3: feat(tasks): render a due-date badge on each task row
Depends on: 1, 2 | Files: `src/tasks/task-row.jsx`, `src/tasks/task-row.css`, `src/tasks/task-row.test.jsx` | Data: one `{ label, tone }` object per row, rendered as its badge | Design: design-ui | Proof: npm test -- task-row
## Judgment
- When this example and this skill's plan specification disagree, the specification wins and this file is the one to fix.
- A field left out here for brevity would be a field left out of a real plan; nothing is left out.
