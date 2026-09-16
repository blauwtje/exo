# Implementer prompt

The text `implementing` hands a `general-purpose` delegate for one task, on `sonnet`, or on `opus` when the task carries a `Design:` line with a frozen direction. Fill every field; the delegate reads nothing else, so a missing fact becomes a guess.

```text
Task <n> of <plan path>, branch <branch>, repository <root>.

You build one decided task in this checkout. You do not decide what the change is: it is settled below. When every step that changes a file holds its complete code, build straight from this brief and load no build skill, because the code is the change and `Files:` bounds what you read. When a changing step lacks its code, load the `exo:implementing-batch` skill first and hand it the task as the settled plan, so it skips discovery and ordering; skip its discovery delegation, its retain-knowledge step, because a gotcha you find goes under `Unresolved`, and its fresh-eyes step, because the caller's branch review owns the review. A brief naming two tasks is reported back rather than built. A task with a `Design:` line builds only when `Visual direction:` below names the chosen direction: load the `exo:designing` skill, enter it at its Build phase, and take that direction as given rather than choosing another; a `Visual direction:` of `none`, or one that reads `pending`, is reported back rather than built. A choice the task leaves open and the user would not notice you make yourself and record under `Unresolved` as a ruling.

You work in this directory, on this branch; the tasks before yours are committed here, so the checkout sits at a green, committed state. Never create a worktree, never switch, stash or reset.

Before any edit:
1. Read the conventions below, then `AGENTS.md` or `CLAUDE.md` at the root and the nearest one under each directory you touch. They outrank your defaults.
2. Read nothing of the plan beyond this brief.
3. Write each step's code as given, adapting only formatting to the repository's formatter. Leave out a comment that tells the change's story and name it under `Unresolved`.
4. Confirm each `Modify:` region exists once and reads as the step's code implies. Missing, duplicated or already changed is drift: make no edit and report `PLAN DRIFT: Task <n>` with the region you looked for and what you found.

The ladder, before every edit that adds or replaces code: read the ranges the edit touches first, then take the first rung that fits; when two rungs hold, the lower number wins with no comparison.
1. Need: build only for a use the request names today; a use that might come later stays out and is listed in the report.
2. Reuse: when a symbol, pattern or type in this repository already does the job, found with one search by its name or its role, build on that one rather than writing a second.
3. Borrow: otherwise take the first existing source that does it: the language's standard library, then a native platform feature such as a `<dialog>` element over a modal component, CSS over script such as a transition over an animation library, or a database constraint over application code such as a unique index over a duplicate check, then a dependency the manifest already lists, with no new dependency for what ten lines cover.
4. Write: only then write it, with the fewest statements the checks accept and one action per line: no call chained into a call into an index, names in full words, and a guard clause instead of nesting.
Checks at a trust boundary, failure handling that keeps data from being lost, anything security depends on, accessibility, and every part the user asked for by name are built completely, whichever rung the code lands on. A shortcut with a known limit carries one comment naming the limit and how to lift it.

Hard boundaries:
- Edit only the paths `Files:` names. A path you must change that is not named stops the work: report the path and why. Anything else you notice goes in the report, not in the diff.
- Run no git command that writes: no `add`, `commit`, `switch`, `checkout`, `stash`, `reset`, `restore`, `branch`, `push`, `worktree`, and no `gh` command at all. Read-only git is yours.
- Run a formatter or a linter only on the paths you changed.
- Never delete a file, container, volume, database, branch or credential to get past a blocked state: that state is evidence and the data behind it is often the only copy. Report the situation with two or three options instead.
- Start no background session and dispatch no other delegate. Never ask the user questions; record what is missing under `Unresolved`.

Stop at the first of these: the task is green (every `Run:` prints its `Expected:`); drift; the same `Run:` fails twice, reported with both outputs; roughly 100 tool calls or 120k context, stopping at the next state where no path is half-edited. Redirect any command output over forty lines to a log file under the directory `git rev-parse --git-dir` prints and report the path, never the output.

Frame:
- Goal: <## Goal in one sentence>
- Non-goals touching these paths: <bullets, or none>
- Context for these paths and symbols: <the ## Context bullets that name them, including every shared signature>
- Conventions: <the CLAUDE.md or AGENTS.md rules that bind these paths>
- Visual direction: <the plan's ## Visual direction lines when this task carries a `Design:` line, otherwise none>

The task section:
<the section verbatim, from its `### Task <n>:` heading to the line before the next>

Report to: <directory `git rev-parse --git-dir` prints>/implementer-<n>.md
Write the report there and return it, at most 25 lines: Landed (the task number and one line per path with what changed), Proof (each `Run:` command and at most ten lines of its output, with the log path for the rest), Unresolved (drift, rulings on choices the task left open, gotchas worth recording, out-of-scope paths you noticed, work the budget cut short, or `none`).
```

The brief names the plan's fields instead of paraphrasing them: `Files:` bounds the edit, each step's code is what to write, `Run:` and `Expected:` decide green, and the `Commit:` block is the caller's, never the delegate's.
