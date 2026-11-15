# Example brief

A brief holds decisions, not their reasoning, in these sections and this order, with Tasks last. This one passes plan-check; the field rules follow its tasks.

## Goal
A task row shows a colored badge for its due date.

## Verdict
Verdict: go
Objection: the list already truncates long rows, so the badge may be clipped on narrow screens.

## Decisions
1. An overdue task shows a red badge.
2. The badge shows the date in the user's locale (exo decided).

## Non-goals
- Reminders for due tasks: `src/notify/`.

## Assumptions
- [code] Due dates are ISO-8601 strings -> keep that format (src/tasks/task.js)

## Acceptance
- Task 3 renders one badge per task row.
- The Success criterion passes.

## Manual checks
- Open the task list: a task due tomorrow shows its badge.

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

## Field rules

- **Decisions:** each answer on its own numbered line; a choice exo made ends `(exo decided)`. When existing code is the user's to restructure, a Decision says so and names it, so the builder reshapes it instead of adding a copy beside it. **Non-goals:** what a reader would assume is included, with its paths; omit the section when empty. **Open points:** only an unanswered user question; build refuses the brief while one is listed.
- **Acceptance:** each item cites a task number, a `Data:` segment or the Success criterion, else it is a Manual check. **Manual checks:** only what needs the user's eyes, hands or account: what to do, then what they should see.
- **Plan basis:** `Repository:` is the absolute root. `Branch:` with no repo is `main`, and the run creates the repo.
  - `Land gate:` is `npm run <script>` for the first of `check`, `test` and `typecheck` in the root package.json, else `none`. When the project has a linter, the gate runs it too, as in `npm run lint && npm run typecheck`, because the project's own lint decides style. A task commits only when its gate passes; a failing gate refuses it before anything commits.
- **Success criterion:** one backticked command that proves every task landed, nothing only the user can check. A command that already passes before the work needs `Red: none (<reason>)` on the next line; a flaky one `Repeat: <2-5> (<reason>)`. When the project has a `bin` or `scripts.start`, the command runs it, else write `Product run: none (<reason>)`.
- **Tasks**, in dependency order. The heading is the commit subject `land-task` uses; the one field line is `Depends on: | Files: | Data: [| Risk: <kind>][| Red: none (<reason>)] | Proof: <one command>`.
  - Red proof: `land-task` runs `Proof:` before the change and after it. After, it must pass, or the task is refused. Before, it should fail, because a proof never seen red proves nothing: when it passes there, `land-task` refuses the task and the builder stops on it with `BLOCKED`. A task whose proof cannot fail first (a refactor, a docs edit) needs `Red: none (<reason>)`. A refactor's `Proof:` compares the output of one command at the base and at the head; a type check or lint alone is no proof.
  - `Proof:` shows this task landed, not that the suite passes; a runnable result is proven on real input through its own command. An MCP proof reads `mcp:<tool> <args>`.
  - `Files:` is staged as listed; a trailing `/` means the whole folder. It lists the test file the proof runs, because the builder may write only listed files. Name only paths you have read, and `grep -rl` a name before renaming it.
  - `Data:` is the task's exact interface: the names, signature or shape it produces or consumes, and the task that reads it, as in ``Data: `task.dueDate: string` (ISO-8601), read by Task 3``. A task with no interface, such as a delete, writes `Data: none (<reason>)`.
  - `Risk:` is `security boundary`, `persisted format`, `public signature` or `dependency`; ask before changing a signature or format, and give the task a test of the rejected or old-format case.
  - A task is the smallest change whose `Proof:` fails before it and passes after it: split where two proofs differ, merge where one proof covers both. Two tasks touching one file need a `Depends on:` path between them. A task that deletes dead code comes before the task that reshapes what is left, which depends on it, and carries `Red: none (<reason>)`. A check only the user can make is a Manual check, never a task.
