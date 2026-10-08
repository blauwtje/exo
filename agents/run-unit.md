---
name: run-unit
description: "Builds and lands one plan block. Dispatched by build only."
model: sonnet
effort: medium
tools: Read, Bash, Agent
---

Read the plan's frame per `<skill>/references/run-loop.md` step 2.

## The loop

1. **Ask the branch what landed.** Run `node "<skill>/scripts/next-task.mjs" --plan <plan> --root <checkout>` and read its `Landed:` and `Next:` or `Wave:` lines.
  - A `Next:` or `Wave:` task outside this block means a block task waits on a `BLOCKED` one; return each `BLOCKED <n> waits on <m>`.
2. **Take the task from the script's output**, never from the plan file: it prints `Brief: <path>`.
  - A `Design:` task is returned `BLOCKED <n> Design: task`.
3. **Dispatch the build.** Each build goes to the `exo:build-task` agent from `<skill>/implementer-prompt.md`, with `run_in_background: false`, in one message, after `date +%s`.
  - Build up to three tasks here on `Drift: none`.
  - Else a wave builds per `<skill>/references/wave-worktrees.md`.
  - Run `node "<skill>/scripts/wait-report.mjs" --since <start> --report <Report to: path>`, timeout 600000.
  - Exit 2 reruns, at most six runs, then `BLOCKED <n> no report`; never a `sleep` command.
  - A repair goes to `exo:solve-hard`, with the dispatch's `model` and `effort`, and `<skill>/drift-repairer-prompt.md` or `<skill>/bug-fixer-prompt.md`.
  - After a repair, a second drift or failure on one task returns it `BLOCKED` with two or three options and the repair's report.
4. **Commit a green task.** Done means `GREEN`, never a report you wrote, since land-task runs each `Run:` or `Proof:` itself; else step 3.
  - Run `node "<skill>/scripts/land-task.mjs" --plan <plan> --task <n> --root <checkout>`.
  - A report refusal goes by SendMessage to its writer, verbatim; never rerun a proof.
  - Any other refusal sends it to step 3; push nothing.
  - A wave lands and removes its worktrees per that reference's steps 3 and 4; a failed task returns to step 3.
  - Return to step 1 until every block task has a `LANDED` or `BLOCKED` line.

## Stop

- Your turn ending is your return: never end it while a block task lacks a `LANDED` or `BLOCKED` line.
- Only the hard message, `past the limit of`, ends the loop: finish the task in flight, return `BUDGET:`.
- Ask the user nothing: a choice or build `BLOCKED` returns it `BLOCKED` with question, options.
- Delete no data or branch, run no `git stash`: `BLOCKED` with options.

## Return

One line per task, no report text, at most eight lines:

- `LANDED <n>` for a committed task, plus ` pending <command>` per `Pending:` line.
- `BLOCKED <n> <reason> <report path>` for any other task, the path `none` without a report.
- `BLOCKED all nested dispatch unavailable: set CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH>=2`, alone, when no tool dispatches.
- `BUDGET: done <list or none>; open <list>; next <sentence>` after the hard message.

With every block task landed or blocked, return these lines, never a `BUDGET:` line.
