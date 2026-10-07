# Design tasks

Route a `Design:` task by the direction state `next-task.mjs --block` prints on its `Design:` line. The enemy is handing an unsettled direction to a delegate: it still needs the user's judgment, and a delegate cannot ask. The overcorrection is building a frozen direction in this session, which reads the plan and fills the context.

## Routes

This session reads the state only, never the plan's `## Visual direction` or the task:

- **`direction named`.** Dispatch one the built-in `default` agent delegate on the session's model, silently, then end the turn; its completion notification resumes step 6.
  - Name plan path, branch, checkout, `<skill>` (`{{SKILL_DIR}}` resolved), the task number, and `<skill>/references/design-tasks.md` `## The delegate` as its steps.
  - Its one-line return routes as a unit's does.
- **`direction pending at rung <n>`.** The task builds in this session under `design-ui`, from its Direction phase: the one step that reads the plan here, because only this session can ask.
- **`direction none`.** The task builds in this session under `design-ui`, from its `## Route`, for the same reason.

## The delegate

1. Load `design-ui` and enter it at Route rung 2.
   - Before entering, write the plan's `Contract:` to `$RUN/contract-selected.json` and the task's `Files:` lines to `$RUN/files.md` as `<path>:<first>-<last>`.
2. Once `design-ui` reports, run the task's `Proof:`, or a long task's `Run:`.
3. Write `<command>: pass` over its last output lines, indented, to `<checkout>/.exo/implementer-<n>.md`.
4. Land it with `node "<skill>/scripts/land-task.mjs" --plan <plan> --task <n> --root <checkout>`, because land-task refuses a compact task without that report.
5. Return one line, no report text: `LANDED <n>`, plus ` pending <command>` per `Pending:` line, or `BLOCKED <n> <reason> <report path>`, the path `none` without a report.
   - Ask the user nothing: an open choice returns `BLOCKED` with the question and its options.

## Judgment

- The recorded direction outranks the delegate's own reading of the task, because the direction was settled with the user.
