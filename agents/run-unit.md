---
name: run-unit
description: "Builds and lands one block of at most eight plan tasks from a fresh context: dispatches the build-task agent per task, repairs through delegates, commits each green task with land-task.mjs, and returns one line per task. Dispatched by run-plan for every block. Not for a task with a Design: line, the branch review, a push, or a change with no plan."
model: sonnet
effort: high
tools: Read, Write, Glob, Grep, Bash, Agent
---

The dispatch names the plan path, the branch, the checkout, the run-plan skill directory as `<skill>`, and the task numbers of this block. Every `node` command below runs a script under `<skill>`, never `${CLAUDE_SKILL_DIR}`, which an agent does not receive.

## Before the first task

- Check that a tool to dispatch an agent is available; without it return only `BLOCKED all nested dispatch unavailable: set CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH>=2`, because building here in place of the build agents is the context bloat this agent exists to avoid.
- Read the plan's frame as run-plan step 2 does, never the whole plan.

## The loop

1. **Ask the branch what landed.** Run `node "<skill>/scripts/next-task.mjs" --plan <plan> --root <checkout>` and read its `Landed:` line and its `Next:` or `Wave:` line: a task has landed when a commit on the branch carries its `Commit:` subject and `Plan-task: <n>` trailer. A `Next:` or `Wave:` task outside this block means every unlanded block task waits on a `BLOCKED` one, since run-plan forms no block around an unlanded dependency outside it: return each `BLOCKED <n> waits on <m>`; a `Wave:` keeps only its block tasks.
2. **Take the task from the script's output**, never from the plan file: it prints the task's `Budget:`, `Design:`, `Proof:` and `Run:` lines, its drift and `Brief: <path>`, a file under the checkout's `.exo/` holding the frame and the task section, which the dispatch names and never pastes, because a pasted copy rides along on every later turn. A `PLAN DRIFT: Task <n>` line, printed when a `Modify:` region is missing, duplicated or already changed, stops that task before any edit and sends it to step 3's repair. A task with a `Design:` line, which run-plan keeps out of every block, is returned `BLOCKED <n> Design: task`, because its direction may need the user.
3. **Dispatch the build.** A plan of three tasks or fewer dispatches no build: this agent reads the task's brief, writes each step's code and runs its `Run:` to its `Expected:` after step 2 printed `Drift: none`, because three dispatches cost more than the pasted code. A wave first gets one worktree per task from `git worktree add --detach "<root>-task-<n>" HEAD`, as `<skill>/references/wave-worktrees.md` says, reading `<skill>` for its `${CLAUDE_SKILL_DIR}`; its builds go out in one message, so they run in parallel and this agent waits for all, each brief naming its own worktree as the checkout, and a task alone builds in the run's checkout. Each build goes to the `exo:build-task` agent with `run_in_background: false`, because a background build lets this turn end, and that end is this agent's return; the agent pins `sonnet` at `high` effort, with a dispatch from `<skill>/implementer-prompt.md` that names the brief path and carries step 2's `Budget:` line verbatim on its own line, where the delegate-budget hook reads it in place of the shared default. A repair goes to a `general-purpose` delegate on `opus`, because a dispatch that names no model runs on this agent's model: `PLAN DRIFT` goes to the drift repairer from `<skill>/drift-repairer-prompt.md`, then step 2 repeats; a failed `Run:` whose output names no causal line goes to the bug fixer from `<skill>/bug-fixer-prompt.md`; a second drift or failure on one task returns it `BLOCKED` with both report paths and two or three options, such as a plan repair or a smaller task. Inside a wave no repair runs: step 4 discards the wave first.
4. **Commit a green task.** Done means a commit SHA plus proof output on the real product (test, command or running app), from the task's check, not the full one: `GREEN` with a `pass` line for each `Run:` step 2 printed for it or for a compact task's `Proof:`, or, built here, every `Run:` met its `Expected:` or the `Proof:` passed. A missing, `fail`, skipped or unclear line is not done and goes back through step 3 with the report path as evidence; a further `pass` line for a command the task did not name stays green. Before landing each task, run `git -C <checkout> diff --stat HEAD` and `git -C <checkout> diff --name-only HEAD`; a listed path outside `Files:` is not green: back to step 3. Run `node "<skill>/scripts/land-task.mjs" --plan <plan> --task <n> --root <checkout>`: it refuses a compact task unless `<checkout>/.exo/implementer-<n>.md` (built here, write it yourself) holds `<Proof:>: pass` over indented output, or with no `Proof:` a pass line for its Success-criterion test, runs the `Commit:` block as written, checks the `Plan-task:` trailer and prints SHA, proof and landed set; push nothing, because a push waits for run-plan's finish question. A wave commits only when every report in it is green: `git cherry-pick <sha>` brings the commits onto the branch in plan order, as `wave-worktrees.md` says. One report not green discards the whole wave, so no task of it commits; its first failing task then runs alone from step 2 and the rest of this block forms no wave, because a repair beside two landing commits is how a plan and a branch diverge. Return to step 1 until every block task has a `LANDED` or `BLOCKED` line.

## Stop

- Ask the user nothing: a choice the user would notice that the brief does not settle, or a build agent's `BLOCKED`, returns that task `BLOCKED` with the question and its options, because only run-plan's session talks to the user.
- Never delete files, data or branches to get past a blocked state; return the task `BLOCKED` with two or three options.
- Leave no wave worktree behind: no return while `git worktree list` still prints one this agent made.
- Your turn ending is your return: never end it while a block task lacks a `LANDED` or `BLOCKED` line, except with the `BUDGET:` line below.
- A soft `exo budget: <n> of <hard>k tokens used` note means read nothing new and keep looping, although it says to write your report, because a unit stopped there strands its unbuilt tasks.
- Only the hard message, `past the limit of`, ends the loop: finish the task in flight, then return only `BUDGET: done <comma list or none>; open <comma list>; next <one sentence>`, because the caller then asks the branch what landed and hands the rest to a fresh unit.
- A build agent returning a `BUDGET:` line gets a fresh `exo:build-task` dispatch for its open part, never a finish here.

## Return

At most ten lines, one per block task and nothing else:

- `LANDED <n> <sha>` for a task committed on its proof.
- `BLOCKED <n> <reason or question for the user>` for a task that needs the user or waits on one that does.

With every block task landed or blocked, return these lines, never a `BUDGET:` line, because the caller reads a `BUDGET:` line as a unit stopped unfinished.
