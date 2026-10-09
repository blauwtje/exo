# One-task mode

`build <plan> --task <n>` lands task `<n>` in this session and asks the user nothing. `run-plan.mjs` starts one such session per task and prints the brief, `## Rules`, the builder rules and `## Finish` in its prompt, so only a hand-typed `--task` runs `## Start`.

## Rules

- One command per Bash call, spelled as the plan or skill gives it, with no `$( )`, `;`, `&&`, `|`, redirect or heredoc: the run's allowlist denies anything else, and a denied command never runs.
- Create and change files only with the Write and Edit tools; read them with the Read tool.
- Work in `<checkout>`, the session's current checkout, with that path literally.
- Ask nothing: a choice you cannot rule is `BLOCKED`; a reversible one you take on its recommended option is a `Decision: <clause>` report line, in place of `Choice:`.
- Dispatch no agent; run no `start-run.mjs`, worktree, tail or `ship`.
- Push nothing; never run `land-task.mjs --fix`.
- `PLAN DRIFT:` line for task `<n>` in the prompt or `next-task.mjs` output → end on `Task <n>: BLOCKED PLAN DRIFT: <item>`.

## Design tasks

Applies to a task whose `Design:` is not `none`; `run-plan.mjs` prints it only then.

- Build by steps 1-3 of `${CLAUDE_SKILL_DIR}/references/design-tasks.md` `## The delegate`, in this session, contract first, with `$RUN` as `<checkout>/.exo`.
- Its `Return:` lines do not apply: `## Finish` sets the last line.
- Its `## Stop` conditions → `BLOCKED <reason>`, the report path in the reason.

## Start

Skip this when the prompt holds the brief.

1. Run `git rev-parse --show-toplevel` alone, use the printed path as `<checkout>`.
2. Run `node "${CLAUDE_SKILL_DIR}/scripts/next-task.mjs" --plan <plan> --root <checkout>`.
   - Expect `Next: Task <n>`, or a `Wave:` line whose first task is `<n>`; any other line → `BLOCKED` with that line as the reason.
3. Read the task's `Brief:` file, then build it per `${CLAUDE_SKILL_DIR}/../../agents/build-task.md` `## Build`, `## Stop` and `## Report`, whose `Report to:` is `<checkout>/.exo/implementer-<n>.md`.

## Finish

1. Run `node "${CLAUDE_SKILL_DIR}/scripts/land-task.mjs" --plan <plan> --task <n> --root <checkout>`; it refuses a report fault before it runs the proof, so run no `--check` first.
   - Refusal → fix what it names and rerun once; a second refusal, `PLAN DRIFT` line or non-zero exit → `BLOCKED <first output line>`.
   - `Pending: mcp:` line → `BLOCKED mcp proof`.
2. End on one line, the last of the reply, nothing after it.
   - `Task <n>: LANDED <sha>`, the sha from the `Committed:` line.
   - `Task <n>: BLOCKED <reason>`, one clause.
