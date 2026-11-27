---
name: build
description: "Builds a change with a proof for each step and one review of the result. Use when the user asks to build, implement, add or change behavior ('add X', 'implement this', 'make Y do Z'), or to run or resume a plan ('run the plan'). Not for a typo or one-line edit, writing a plan, or a bug whose cause is unknown."
argument-hint: "[plan path] [--land]"
metadata:
  author: exo
  tags: build, plan, proof
---

# Build

## Purpose

Build lands a plan one task at a time. A task lands when its proof passes after the change and the plan's Land gate passes; `land-task.mjs` checks both and commits. A task that changes structure but not behaviour proves itself by the same command giving the same output at the base and at the head; a type check or lint alone shows nothing about behaviour.

## Prerequisites

`node` and `git`; `gh` when the run ends on `exo:ship`.

## Instructions

### The loop

A plan path runs this loop. With no path and no decided change, run step 2's script with `--plan` on each file in `docs/specs/`; when exactly one prints a `Next:` task, use that plan and say so, and ask for the path when several or none do. `--land` pushes at the end without asking.

1. **Settle the workspace.** A branch or worktree the request names is the answer; otherwise build on the current branch. On `main`, create a branch named after the plan topic and say so, without asking, because a plan run needs its own branch to review.
   - Invoking build authorizes commits there; a push waits for `exo:ship`, except with `--land`.
   - Once the workspace is settled, run `node "${CLAUDE_SKILL_DIR}/scripts/adopt-plan.mjs" --plan <path> --root <checkout>`, which commits an untracked or changed plan on this branch, and use the `Plan:` path it prints for the rest of the run. A non-zero exit is a blocker to report.
   - Note the run start with `date -u +%Y-%m-%dT%H:%M:%SZ`.
   - Before the first task, run the plan's `Land gate:` once, in the background, to a log, and read only the failing lines, unless it is `none`.
   - A failure already there is not any task's, so hand it to `exo:diagnose` before Task 1 and name it in the final report.
2. **Ask the branch what landed.** Run `node "${CLAUDE_SKILL_DIR}/scripts/build-dispatch.mjs" --plan <path> --root <checkout>`, adding `--attempt <n>` on a retry and `--missing-input` when the report names a missing input.
   - It prints the landed tasks, the `Next:` line, a `Brief:` path, a `Report:` path, the `Agent:` and `Model:` for the Agent call and the `Prompt:` block; the brief file holds the task text with the plan's Decisions, Non-goals and Facts.
   - Only a `Plan-task:` commit shows what landed, so on a restart rerun it.
   - `Next: none` goes to End of the run.
3. **Build one task.** A task line with `Model: <model> <effort>` sets the Agent tool's `model` and `effort` for that builder; else the Models table decides. The `Route:` line picks who builds, and the builder or this session lands the task with `land-task.mjs`, which proves red then green, runs the Land gate and commits.
   - `Route: builder`: send the task of the `Next:` line to a fresh `exo:builder` in the background, with the `Prompt:` block it printed and only your own lines added, and wait for its completion notification.
   - `Route: builder chain <k>`: send one fresh `exo:builder` the same prompt plus the `next-task.mjs` command path and `Chain: <k>`; it lands up to `<k>` tasks in sequence.
   - `Route: this session`: open `references/self-build.md`, then read `references/code-rules.md` and write the report in the layout of `references/run-task-prompt.md`, and run the same `land-task.mjs` call a builder runs.
4. **Route the return.** `GREEN` goes back to step 2; a chain builder returns one status line per task, and each line is routed here, starting at step 2 again. A `Removed test lines:` block in the landing report is a weakened test unless the task text asks for the removal, because a loosened test hides a regression; send it to a fix round. Compare the report's `Ran:` line with the Models row and name a difference in the final report.
   - `BLOCKED <n> NEEDS ANSWER: <question>`: ask the user with the builder's options and recommendation as the question, then re-dispatch that task with the answer in its prompt.
   - `PLAN DRIFT`: append a `## Log` line to the plan, then stop and hand the plan back to `exo:spec` with the builder's reason, because the plan no longer fits the code.
     - When the reason makes a landed task wrong, add the lines that `node "${CLAUDE_SKILL_DIR}/scripts/undo-task.mjs" --plan <path> --root <checkout> <n>` prints.
   - A builder that returns no status line: read `git status` of its checkout and its report file before sending a fresh builder, and pass both in that builder's prompt.
   - `BLOCKED <reason>`: append a `## Log` line to the plan before you report it.
   - A build that fails once, a self-built task included, goes back to a fresh `exo:builder` with the `Failed report:` path `next-task.mjs` printed in its prompt, on the second-attempt row of the Models table that fits its report.
   - `BLOCKED proof <command> did not fail first`: `land-task` refused the task because its proof passes without the change and so proves nothing.
     - Send a fresh `exo:builder` to tighten that test, or hand the plan to `exo:spec` for a `Red: none (<reason>)`.
     - Name the task in the final report.
   - A build that fails twice, or a repair that must change a module outside the task's `Files:`: stop, report both and hand it to `exo:diagnose`, because a third try repeats the same premise.
   - A repair names the rule the code broke and fixes the hits the finding names; one guard that fails on a new instance, at most one new test per cause, so the suite stays small.

### Models

| Job | Who | Model, effort |
|---|---|---|
| Build a task, `Route: builder` | `exo:builder` | Sonnet, medium |
| Build a chain, `Route: builder chain <k>` | `exo:builder` | Sonnet, medium |
| Build a task, `Route: this session` | this session | its own model |
| Second attempt, the report names a missing input | `exo:builder` with the Agent tool's `model: sonnet` and `effort: medium`, with the missing answer in its prompt | Sonnet, medium |
| Second attempt, any other failure | `exo:builder` with the Agent tool's `model: opus` and `effort: high` | Opus, high |
| A design choice the plan leaves open | this session | its own model, high |
| Find a cause (diagnose investigator) | `exo:builder` with the Agent tool's `model: opus` and `effort: high` | Opus, high |
| Code lookup (`Sources: repo`) | `exo:researcher` with the Agent tool's `model: haiku` and `effort: high` | Haiku, high |
| Research | `exo:researcher` | Sonnet, medium |
| Write a brief (`exo:spec`, more than 3 tasks) | `exo:builder` with the Agent tool's `model: opus` and `effort: medium` | Opus, medium |

### End of the run

1. Review the branch diff first, so the last code written is the code checked:
   - Call the built-in `code-review` skill once through the Skill tool with args `<effort> <branch>`, where `<effort>` is the word of the `Review effort:` line that `next-task.mjs` prints with `Next: none`, or `medium` with no plan. Open `references/review.md` at that moment and brief the review as it says; it names the code rules in `${CLAUDE_SKILL_DIR}/references/code-rules.md`. With no `code-review` skill listed, say no review ran.
   - Use each finding's severity field (important, nit or pre_existing), counting a finding with no severity as important.
   - Send each important finding to one fresh `exo:builder`, all in one message, and check every launch result for an error. Start at most `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` (20 by default) at once.
   - Brief each: "write the failing test or repro for this finding in a new test file named for its finding, so parallel builders never share a file; with no repro, drop it". A structure finding's repro is the command whose output shows it, such as the import line or a line count, because a finding nobody reproduced may be wrong.
   - Fix only the reproduced findings, in one builder fix round that commits with the land command's `--fix <subject>`.
   - List the dropped findings as unproven, and the nit and pre_existing ones, in the report.
2. Run the plan's `Success criterion` command once, in the background, to a log, and read only the failing lines.
   - Then run the plan's `Land gate:` command once the same way unless it is `none`; `land-task.mjs` skips a gate whose last pass took 60 s or more, so this is the one run of a slow gate.
   - A failure goes to one builder fix and one rerun; a second failure ends with what still fails.
3. Build the report from the `Diff stat:` and `Plan-task commits:` lines that `next-task.mjs` printed with `Next: none`, not from the builders' summaries, which can overstate.
   - `Diff stat: base unknown` means there is no base: no origin/HEAD and no local main or master, or a checkout on the default branch. Then name the branch, say the diff stat is unknown and build on the `Plan-task commits:` lines.
   - State whether the branch is ready, the findings and what the user does next, and label each claim measured, inferred or guess.
   - Keep `Proof:` lines and `## Manual checks` out of the message; the task reports in the temp folder hold them.
   - List every `Noticed:` line it printed, so no issue a builder left unfixed is lost.
   - Run `node "${CLAUDE_SKILL_DIR}/scripts/run-usage.mjs" --session ${CLAUDE_SESSION_ID} --since <start>` and put its lines in the report.
4. Before ending, commit the plan's new `## Log` lines as one commit on the branch, because the plan belongs in the pull request. Skip it when the plan lies outside the checkout or git ignores it, and do not use `git add -f`.
   - End on `exo:ship`, unless the request rules out a push; then say nothing left the machine. `--land` passes `--land` to `ship`.

### No plan

A decided change with no plan file runs the steps in `references/no-plan.md`, so a small change gets the same proof. Open it when the request has no plan path; it reads `references/code-rules.md` too.

## Examples

Request: "run the plan docs/specs/login.md". Build runs the loop, one fresh `exo:builder` per task, and ends on `exo:ship`.

```
Landed: 1, 2
Next: 3 feat(login): add the token check
Brief: /tmp/exo-user/app-1a2b3c4d/login/task-3/brief.md
Report: /tmp/exo-user/app-1a2b3c4d/login/task-3/implementer.md
Dispatch:
  ...
```

## Limitations

- Outside `Route: this session`, this session writes at most 2 product files in a run; send anything larger to a builder, one per independent part.
- Run no check of your own after a landing.

## Available Scripts

| Script | Purpose | Arguments |
|---|---|---|
| `adopt-plan.mjs` | Commits an untracked or changed plan on the build branch, moving it from another checkout of the repository, and prints `Plan: <path>` | `--plan <path> --root <checkout>` |
| `next-task.mjs` | Prints the landed tasks, the `Next:` line, a `Brief:` path to a file with the task text and the plan's Decisions, Non-goals and Facts, the `Report:` path of the task's report and the `Dispatch:` lines; with `Next: none` it also prints the review effort, the `Review focus:` lines, the `Diff stat:`, the `Plan-task commits:` and the `Noticed:` lines of the task reports | `--plan <path> --root <checkout>` |
| `build-dispatch.mjs` | Runs `next-task.mjs` and prints, for the next task, the `Agent:`, the `Model:` (`none` on attempt 1, the retry model on a later attempt, the builder's own with `--missing-input`) and the `Prompt:` block of `Dispatch:` lines | `--plan <path> --root <checkout> [--attempt <n>] [--missing-input]` |
| `undo-task.mjs` | Prints the revert commands for one landed task and the landed tasks that depend on it | `--plan <plan> --root <checkout> <n>` |
| `run-usage.mjs` | Prints the input tokens, output tokens and minutes of the lead session and each helper transcript since the run start, then the totals | `--session <id> --since <ISO time> [--projects <dir>]` |
| `proof-run.mjs` | Runs a proof command in the checkout to `<logs>/<name>.log` and prints `Log: <path>`, `Exit: <code>` and the lines holding `not ok`, `✖` or `FAIL`, else the last 40 lines | `--name <name> --command <command>` |
| `land-task.mjs` | Proves a task red then green, runs the Land gate and commits | `--plan <path> --task <n> --root <checkout>`, or `--fix <subject>` |
