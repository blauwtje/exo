# Example brief

A brief holds decisions, not their reasoning, in these sections and this order, with Tasks last. This one passes plan-check.

## Goal
A task row shows a colored badge for its due date.

## Verdict
Verdict: go
Objection: the list already truncates long rows, so the badge may be clipped on narrow screens.

## Decisions
1. An overdue task shows a red badge.
2. The badge shows the date in the user's locale.

## Non-goals
- Reminders for due tasks: `src/notify/`.

## Facts
- Due dates are ISO-8601 strings, so keep that format: src/tasks/task.js:3

## Acceptance
- Task 3 renders one badge per task row.
- The Success criterion passes.

## Manual checks
- Open the task list: a task due tomorrow shows its badge.

## Review Focus
- A task saved before this change has no due date: the list must still load.
- `src/tasks/due-tone.js` stays pure: it imports nothing from the row, list or store files.

## Plan basis
Repository: /repo
Branch: due-date-badge
Worktree setup: none
Land gate: npm run typecheck

## Success criterion
`npm test` passes.
Red: none (each task's Proof proves its own red)

## Tasks
### Task 1: feat(tasks): add a dueDate field to the task record
Depends on: none | Files: `src/tasks/task.js`, `src/tasks/task.test.js` | Data: `task.dueDate: string` (ISO-8601), read by Task 3 | Proof: npm test -- task.test
### Task 2: feat(tasks): derive a badge tone from a due date
Depends on: none | Files: `src/tasks/due-tone.js`, `src/tasks/due-tone.test.js` | Data: `dueTone(dueDate: string): { label: string, tone: string }`, read by Task 3 | Proof: npm test -- due-tone
### Task 3: feat(tasks): render a due-date badge on each task row
Depends on: 1, 2 | Files: `src/tasks/task-row.jsx`, `src/tasks/task-row.css`, `src/tasks/task-row.test.jsx` | Data: `<TaskRow task>` renders `dueTone(task.dueDate)` as one badge | Proof: npm test -- task-row
### Task 4: feat(tasks): keep the due date from the saved file to the badge
Depends on: 3 | Files: `src/tasks/task-store.js`, `src/tasks/task-list.jsx`, `src/tasks/task-store.test.js` | Data: `saveTask(task)` writes `dueDate`, a file without it loads as `dueDate: null`, and `<TaskList>` shows the saved date's badge | Consumes: Task 3: TaskRow | Risk: persisted format | Proof: npm test -- task-store
### Task 5: refactor(tasks): delete the unused formatDue helper
Depends on: 2 | Files: `src/tasks/format-due.js` | Data: none (deletes dead code) | Red: none (a deleted helper has no test to fail first) | Model: haiku low | Proof: npm test -- due-tone
