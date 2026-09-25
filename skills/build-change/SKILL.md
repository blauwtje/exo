---
name: build-change
description: "Use when a decided change built this session touches over two files, a dependency, a public signature, a persisted format or security boundary, or is test-first: TDD, a bug with a reproduction. Not for a plan file, another change of at most two files, a version bump, or an unproven failure."
argument-hint: <decided change>
---

# Implement

Run a decided change to completion in one pass. The enemy is checkpoint implementation: repeated confirmation of decisions already made. The overcorrection is unchecked autonomy: one wrong assumption propagates through every file.

## Activation gate

For a decided change, count these facts after initial inspection: more than two source/test/config files must change; a dependency is added; a public signature changes; a persisted format or security boundary is crossed; a required file was not covered by the inspection. Zero facts means read the ranges, make the direct edits, run their check, report, and stop, applying the test-design row first when the change is risky or adds or changes an automated test. One or more runs the loop.

A change the user wants test-first (test-first, TDD, red-green, write the test first, a bug with a reproduction) runs the loop with `## Test first` at any file count, because the two-file shortcut has no red run.

## Context discipline

- Address files by repository-root-relative or absolute paths. Never chain `cd &&` and never pipe a test or build runner, because both hide which command failed and its exit code.
- Read ranges with an offset and a limit and scope every grep to a path; read here only the ranges you will edit.

## The loop

1. **Orient.** When a file named implement-next.md exists under the directory `git rev-parse --git-dir` prints, read it first: it holds a previous context's task list and remaining edits; delete it once they land. When one plan task is the unit of work, its `Files:` lines and step code are the orientation: read those regions and dispatch no discovery. When the request names the file or symbol, read its range here. Otherwise, or when one direct search failed to settle it, dispatch discovery to the `exo:locate-code` agent with the change and the files or symbols to locate, then read only the ranges it names under `Read next` plus their direct callers or callees. Treat upstream Decisions as settled. Then apply the data-migration row.
2. **Order.** Draw the dependency edges between edits: `A → B` means B cannot land green before A. Two or more edges load `draft-plan` at inline depth before editing, unless an upstream `define-scope` brief already orders every edge. Settle a shared data shape's types before ordering behavior edits against it. Then open the task list in the harness: one line per ordered edit, inline-plan step, or plan task.
3. **Settle the workspace, then the baseline.** Before the first edit, settle where the change commits as `../run-plan/references/workspace.md` says, and stop until the answer when it asks; its question offers three options, a new branch, a worktree and the current branch, the recommended one first. When more than one file will change, confirm the working tree is clean or name every pre-existing changed path. Then apply the security and test-design rows.
4. **Build.** Make the decided edits in dependency order against the ranges you have read; do not re-scan the tree between edits or ask between files already inside scope. A hand edit repeated across many files becomes a script or codemod, run once. Keep every mutating edit idempotent: a retry reaches the same end state, not a second effect. A comment states a constraint, an invariant, or a reason a reader of that file needs, never the change's story, which goes in the commit and pull request because a comment outlives the change. Set each task-list line to in progress as its edit starts and to completed as it lands. After a context compaction, rebuild what has landed from the working tree diff before the next edit: the tree, not memory, records what landed.
5. **Prove.** A risky change, as `references/test-design.md` defines it, quotes the failing test output before the first production edit and the passing output after it, and no other tier substitutes. Otherwise use the first available tier: exercise the feature; else run a test that failed before and passes after; else run type check and build. A reasoned argument is not completion: when logic changes in a repo with a test runner and no test ran, report *unverified*, not *done*.
6. **Retain project knowledge.** A recurring correction becomes a lint, type, or check before a text line, when the repository can build one. If proof revealed a build, test, or run command, or a failure-causing repository gotcha, missing from the root `AGENTS.md`, or else the root `CLAUDE.md`, append one line there; with neither, create nothing. Record no session history: progress stays in the task list and reaches a file only through the context breaker.
7. **Fresh eyes.** Skip this step when the caller states that a pull-request review follows, because that review is the one fresh look, or when `git diff --stat` reports at most two changed files and under 80 changed lines. Otherwise dispatch a `general-purpose` delegate on the session's model from `reviewer-prompt.md`, carrying the request, the repository root, and the effort (`low` up to five changed files or 200 changed lines, `medium` above); it writes batch-review.md. On `CLEAN`, go to Step 8. On `BLOCKED`, report the line and go to Step 8 with the review open. On `FINDINGS`, read only batch-review.md and, per `fix` finding, only its `file:start-end` range, fix it under Step 5's proof, then append `fixed` or `reported: <reason>` to that line; leave each `report` finding unchanged and give it one line in Step 8's overview. Request match, scope, and claimed proof stay with Step 8, because `code-review` takes no Goal. When the session cannot dispatch, run `code-review`, or else the critique checks, inline as today, and report that no separate context was available.
8. **Commit, then finish.** Commit where step 3 placed it, in Conventional Commits, leaving out every pre-existing changed path step 3 named; outside a git repository nothing commits. Then end on `ship`: its overview carries the goal reached, the proof command with its result, and a decision made on the user's behalf as one line, and its question is the one open action. The reasoning behind a decision and work outside the request stay out.

## Test first

This route runs inside steps 3 to 8, one behavior per cycle through every layer it touches, with `references/test-design.md` loaded. Read `references/test-first.md` before naming the first boundary: it holds the cycle and the excuses that skip the red run. Two rules hold even unread: the user confirms the observable boundaries before the first test, unless the request names each input with its expected output; and no production edit lands before the new test's failing output is quoted, unless the red run needs infrastructure the repository lacks, which reports the closest executable check used instead.

## Breakers

Three conditions stop the loop and force an evidence report:

- A hook reports the context budget crossed. Finish the edit in progress at a green state, write the task list with its states and the remaining edits to a file named implement-next.md under the directory `git rev-parse --git-dir` prints, report, and say a context clear comes next. In a delegate the `exo budget:` hook does the reporting; once it denies tools, no check runs, so the unproven edit is reported as open.
- The same symptom survives two fix attempts. Report both attempts and observations; do not try a third variation of the same mechanism.
- A required edit lies outside the paths named during orientation or by the brief or plan. Report the path and dependency before touching it; work that belongs on its own branch is reported, never started.

## References

| File | Read it when |
|---|---|
| `../run-plan/references/workspace.md` | Step 3, before the first edit. |
| `reviewer-prompt.md` | Step 7, before the dispatch. |
| `references/critique.md` | Step 7, only when no delegate can be dispatched and `code-review` is absent. |
| `references/security.md` | After orientation and baseline, before the first affected test or production edit, only when changed behavior crosses authentication/authorization; tenant/resource ownership; secrets/credentials; untrusted input; network, file, or process execution; cryptography; or payments/regulated-data boundaries. Filenames and dependency names alone do not qualify. |
| `references/data-migration.md` | After orientation and before ordering, only when work changes a database schema, persisted-data or file format, backfill, destructive DDL, persisted-data deletion, or compatibility between concurrently deployed versions. In-memory types, cache rebuilds, and version-only dependency bumps do not qualify. |
| `references/test-design.md` | After the baseline and before adding or changing an automated test or production behavior, only when logic or public behavior changes or the request adds or changes an automated test, and the repository exposes an automated test runner. Style, text, and version-only changes do not qualify. |
| `references/test-first.md` | The `## Test first` route, before naming the first boundary. |
| `references/performance.md` | A speed-only change, before the measurement that precedes the first edit; not for correctness work. |
| `../route-skills/references/question.md` | Before a message that asks the user to pick among numbered options. |

## Precedence

`find-cause` owns an unproven failure until its cause is established. The frontend-design skill the executing session has loaded owns visual decisions during Build; this skill retains orientation, ordering, non-visual wiring, proof, critique, and reporting.

## Judgment

- Explicit user instructions outrank this skill.
- A repair that crosses a second owner, keeps an old route beside the new one, or cannot be explained in one pass goes to `find-cause` instead of a further patch, because each sign says the cause is elsewhere.
- Repository test, build, naming, and review conventions outrank unspecified defaults here.
