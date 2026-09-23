# Plan artifact specification

Give a zero-context executor every file, line of code, command and expected result it needs, so a cheap model pastes and runs instead of deciding. The enemy is a task that describes a change and leaves the code to the executor. The overcorrection is loading this depth for a two-edit inline order the current session executes immediately.

Write for a reader with zero conversation context: no "as discussed", no "above", no reference back to the request; every referent is a path, symbol or command named inside the plan. The plan carries no question and no placeholder: a fact the planning session could not settle is asked before the plan is written, and a choice the user would not notice is made in the plan.

## Header sections, in order

1. `## Goal`: one sentence naming the observable result.
2. `## Plan basis`: opens with `Repository: <absolute root>` and `Branch: <branch>` on their own lines, which `implementing` reads to match a plan to a checkout; for a folder that is not a git repository yet, `Repository:` still names it, `Branch:` reads `main`, and one basis line says the executor runs `git init -b main` there before the first task, never an init step for the owner. A plan in which at least two tasks do not depend on each other, directly or through another task, adds a third line, `Worktree setup: <command>` or `Worktree setup: none`: the command that lets a fresh worktree of this repository run the plan's `Run:` lines, such as the dependency install the repository's manifest and lockfile call for, because `implementing` builds such tasks together in worktrees that hold no ignored file; without the line the run builds one task at a time. Then the ref planned against, relevant dirty state, the pinned tool and library versions the plan depends on, and every command the planning session could not run itself; closes with the literal sentence "Executor loads the `implementing` skill on this plan before the first task." It carries no branching, commit, push or pull-request policy: the skill that runs the plan owns those, and a plan that overrides them disables a gate the executor cannot see.
3. `## Non-goals`: adjacent work that stays unchanged; the executor treats these as hard boundaries.
4. `## Context`: the verified facts the plan depends on: current behavior, owning files and symbols, the conventions the edits follow, and every signature two tasks share, because a task's executor sees only its own task.
5. `## Visual direction`: only when a task carries a `Design:` line; exactly one `Design skill: <name>` line naming the skill that task loads, then the chosen direction in one line, or `Direction: pending at rung <n>` when that skill ran inside a read-only planning mode, the evidence it rests on, and the choices an executor may not invent.
6. `## Tasks`: dependency-ordered tasks in the template below.
7. `## Final verification`: the commands proving the whole change with their expected results, closing with a literal `Walkthrough:` line: the one command or URL a person runs to see the result. `Walkthrough: none` is valid only when nothing is user-visible, and says why on the same line.

## The task template

````
### Task <n>: <title>

Depends on: none | Task <m>[, Task <k>]
Design: <skill name>    (only when the task changes what a page looks like; omit otherwise)
Risk: <the boundary this task crosses>    (only when the task is risky; omit otherwise)

Files:
- Create: `<path>`
- Modify: `<path>` (`<function, selector, or config key>`)
- Test: `<path>`

Step 1: <imperative title>
```<lang>
<the complete file, or the complete function or region, as it must read after this step>
```
Run: `<command>`
Expected: <the observable result, quoted where it is output>

Step 2: <imperative title>
...

Commit:
```bash
git add <every path under Files>
git commit -m "<type>(<scope>): <title>" -m "Plan-task: <n>"
```
````

## Rules

1. **The code is the spec.** Every step that changes a file shows the whole file, or the whole function or region, as it must read afterwards. "Similar to Task 2", "add validation", "handle errors" and TODO-shaped steps are plan failures; the plan repeats code rather than pointing at it.
2. **Verified names only.** Every path, symbol, signature, version, fixture key and environment variable was read in this repository during the planning session; an invented one still reads well and fails at the executor's first run.
3. **Every change is proven.** A step that changes a file ends with `Run:` and `Expected:`, or the next step's `Run:` covers it. A task that is risky as implementing-batch's test-design reference defines it carries a `Risk:` line naming that boundary. Its first step writes the test, with an `Expected:` that is the failure the missing behavior causes, before the step that writes the code, whose `Expected:` is the pass. Where the repository exposes a test runner and a routine task changes behavior, the same order holds.
4. **One task, one commit.** The `Commit:` block names every path under `Files:` and carries the `Plan-task: <n>` trailer, which is how `implementing` detects a landed task. A task changes nothing outside `Files:`.
5. **Small tasks.** A task lands in one delegate context: about two to five steps and one concern. Split a task whose steps reach a second concern.
6. **Rationale where required.** A file the request did not name, and an edit not forced by a signature or call site, is explained in `## Context` or the step title, never as a comment inside the code: the executor pastes that code, and a comment telling the change's story outlives it.
7. **Repository conventions.** Each task connects to the repository's own test registration, error types, logging and layout; the plan invents no parallel pattern.
8. **Design tasks.** A task with a `Design:` line fixes structure, class names and copy in its code and leaves the visual values to the named skill, which the executing session loads before that task's first edit.
9. **Drift.** The executor compares each `Modify:` region with the tree before editing; a region that no longer matches stops that task before any edit with `PLAN DRIFT: Task <n>` and the mismatch, and the running `implementing` session repairs that task alone.
10. **Acceptance coverage.** Every acceptance check in the brief reaches a step's `Expected:`, a `## Final verification` line, or `## Non-goals`, in the brief's own words; a check in none of the three is a plan failure, because the branch review is the next thing that would catch it.
11. **Vertical slices.** A change that crosses layers, such as data, API and UI, plans each task as one path through every layer it needs, with a `Run:` that exercises that path, never one layer per task: a plan by layer proves itself only at its last task. The exception is a `Design:` task, which builds the UI of a path an earlier task already serves, because its build routes to the named design skill.

## Judgment

- Verified repository evidence outranks remembered symbols and generic patterns.
- Explicit user decisions outrank inferred implementation choices; a choice the user would notice is asked before writing, never left to the executor.
- A green task outranks a tidy diff: never leave the repository red to finish a task sooner.
