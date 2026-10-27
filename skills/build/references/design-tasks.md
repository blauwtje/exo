# Design tasks

Route a `Design:` task by the direction state `next-task.mjs --block` prints on its `Design:` line. Unsettled direction → stays with this session: it needs the user's judgment and a delegate cannot ask. Frozen direction → delegate, not this session: building it here reads the plan and fills the context.

## Routes

This session reads the state only, never the plan's `## Visual direction` or the task:

- **`direction named`.** Dispatch one `general-purpose` delegate whose prompt opens with `exo-kind: peer`, silently, then end the turn; its completion notification resumes step 6.
  - Name plan path, branch, checkout, `<skill>` (`${CLAUDE_SKILL_DIR}` resolved), the task number, and `<skill>/references/design-tasks.md` `## The delegate` as its steps.
  - Call no ScheduleWakeup, ListAgents, Monitor or sleep meanwhile.
  - Its one-line return routes as a unit's does.
  - It stops before landing (no return line, or a context-limit handover) → dispatch one finish delegate, same prompt shape, naming the on-disk diff and `<checkout>/.exo/implementer-<n>.md` if it exists; it runs `## The delegate` from step 2 and never rebuilds.
- **`direction pending at rung <n>`.** Build the task in this session under `design-ui`; this session can ask the user.
- **`direction none`.** Build the task in this session under `design-ui`, same reason.

## The delegate

The session never reads this section; only the delegate does.

1. Load `design-ui` and build the task's `Files:`. Run no look pass and dispatch no critic yet: landing comes first.
   - The plan names a `Contract:` → it is the direction; the plan names none → `design-ui` decides it, so `BLOCKED` on no contract is wrong.
   - The plan's direction outranks your own reading of the task.
2. Once `design-ui` reports, run the task's `Proof:`, or a long task's `Run:`.
3. Write `<command>: pass` over its last output lines, indented, to `<checkout>/.exo/implementer-<n>.md`.
4. Land it with `node "<skill>/scripts/land-task.mjs" --plan <plan> --task <n> --root <checkout>`; land-task refuses a compact task without that report.
5. Landed → run the look and critic passes of `design-ui` on the landed files; findings go in one follow-up `fix(<scope>):` commit with no `Plan-task:` trailer, and no finding leaves the task unlanded.
6. Return one line, no report text: `LANDED <n>`, plus ` pending <command>` per `Pending:` line, or `BLOCKED <n> <reason> <report path>`, the path `none` without a report.
   - Ask the user nothing: open choice → return `BLOCKED` with the question and its options.
