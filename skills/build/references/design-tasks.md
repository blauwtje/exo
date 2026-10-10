# Design tasks

Route a `Design:` task by the direction state `next-task.mjs --block` prints on its `Design:` line. Unsettled direction → stays with this session: it needs the user's judgment and a delegate cannot ask. Frozen direction → delegate, not this session: building it here reads the plan and fills the context.

## Routes

This session reads the state only, never the plan's `## Visual direction` or the task:

- **`direction named`.** Dispatch one `general-purpose` delegate on the session's model, silently, then end the turn; its completion notification resumes step 6.
  - Name plan path, branch, checkout, `<skill>` (`${CLAUDE_SKILL_DIR}` resolved), the task number, and `<skill>/references/design-tasks.md` `## The delegate` as its steps.
  - Its one-line return routes as a unit's does.
- **`direction pending at rung <n>`.** Build the task in this session under `design-ui`, from its Direction phase: the one step that reads the plan here, because only this session can ask.
- **`direction none`.** Build the task in this session under `design-ui`, from its `## Route`, same reason.

## The delegate

The session never reads this section; only the delegate does.

1. Load `design-ui` and enter it at Route rung 2.
   - Before entering, write the plan's `Contract:` to `$RUN/contract-selected.json` and the task's `Files:` lines to `$RUN/files.md` as `<path>:<first>-<last>`.
   - The recorded direction outranks your own reading of the task; it was settled with the user.
2. Once `design-ui` reports, run the task's `Proof:`, or a long task's `Run:`.
3. Write `<command>: pass` over its last output lines, indented, to `<checkout>/.exo/implementer-<n>.md`.
4. Land it with `node "<skill>/scripts/land-task.mjs" --plan <plan> --task <n> --root <checkout>`; land-task refuses a compact task without that report.
5. Return one line, no report text: `LANDED <n>`, plus ` pending <command>` per `Pending:` line, or `BLOCKED <n> <reason> <report path>`, the path `none` without a report.
   - Ask the user nothing: open choice → return `BLOCKED` with the question and its options.
