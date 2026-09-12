---
name: implementing-batch
description: Use when a decided change builds in this session end to end, after initial inspection shows it modifies more than one source/test/config file, adds a dependency, changes a public signature or user-visible behavior, adds or changes automated tests, or reaches a file inspection did not cover; also for one checkpoint handed over by `implementing`, or a whole plan run in the session. Not for one-file typo corrections or internal renames, version-only bumps of an existing dependency, git-only operations, read-only questions, or failures whose cause is unproven.
---

# Implement

Run a decided change to completion in one pass. The enemy is checkpoint implementation: repeated confirmation of decisions already made. The overcorrection is unchecked autonomy: one wrong assumption propagates through every file. Use breakers instead of checkpoints.

## Activation gate

Skip this skill when the whole request is a one-file text correction that changes no behavior, a one-file internal rename that changes no public signature, a version-only bump of an installed dependency with no required API migration, a git operation, or a read-only question.

For every other decided change, count these facts after initial inspection: more than one source/test/config file must change; a dependency is added; a public signature changes; user-visible behavior changes; a required file was not covered by the inspection. Zero facts means make the direct edit, run its check, report the result, and stop — applying the test-design row in References first when that edit adds or changes an automated test. One or more means run the loop.

## Context discipline

Every token a tool call returns into this context is re-read on every later turn. Keep this context small.

- Address files by repository-root-relative or absolute paths. Never chain `cd &&`, and never pipe a test or build runner: a chained or piped command bypasses the Bash output guard's 200-line cap.
- Read bounded ranges: pass an offset and a limit to Read; scope every grep to a path; never `cat` a file over 100 lines — Read the range you need.
- Delegate every read-only discovery and multi-file search to a `general-purpose` delegate from `../research/scout-prompt.md`, and the review to `code-review`, so their output never lands here. Read directly here only the ranges you will edit.

## The loop

1. **Orient.** When a file named implement-next.md exists under the directory `git rev-parse --git-dir` prints, read it first: a previous context left the ledger and the remaining edits there, so they are the orientation, and delete the file once they land. Otherwise dispatch discovery to a `general-purpose` delegate from `../research/scout-prompt.md`: give it the change and the files or symbols to locate. Read directly here only the ranges the scout names under `Read next`, plus their direct callers or callees. Treat upstream Decisions as settled. When a caller hands in one plan task, its `Files:` lines and step code are the orientation: read those regions directly and do not dispatch a `general-purpose` delegate from `../research/scout-prompt.md`. Name the root documentation path: `AGENTS.md` when the repository root contains it, otherwise a root `CLAUDE.md` when present; create neither. After orientation and before ordering, apply the data-migration row in References; do not load it during the initial read.
2. **Order.** Draw the dependency edges between edits: `A → B` means B cannot land green before A. Two or more edges load `planning` at inline depth before editing, unless an upstream `shaping` brief already lists every edge and places A before B for each one. A handed-in checkpoint is already ordered: its `Edit:` entries run in listed order and draw no new edges. Then write the ledger once: the ordered edits — the inline plan's steps, the plan artifact's checkpoints when one exists, or the handed-in checkpoint's `Edit:` entries alone — as numbered lines, each marked `todo`.
3. **Establish the baseline.** Before the first edit when more than one file will change, confirm the working tree is clean or name every pre-existing changed path. After the baseline and before the first affected test or production edit, apply the security and test-design rows in References; do not load either during orientation.
4. **Build.** Before the first edit that adds or replaces code, load `right-sizing` and take the rung it names from the ranges already read; the ladder sizes the edit, never the reading. Make the decided edits in dependency order against the ranges you have read; do not re-scan the tree between edits and do not ask between files already inside scope. A comment documents the code as it stands, a constraint, an invariant, or a reason a reader of that file needs; the change's story goes in the commit and the pull request instead, because a comment outlives the change and then reads as a fact about the code. Mark each ledger line `done` as its edit lands, restating only that line. After a context compaction, rebuild what has landed from the working tree diff before the next edit — the tree, not memory, records what landed.
5. **Prove.** Use the first available tier in this order: exercise the feature; otherwise run a test that failed before and passes after; otherwise run type check and build. Run the proof as one bare command here — no `cd &&`, no pipe. When its output would exceed the cap, redirect it: `<cmd> > .git/implement-proof.log 2>&1; tail -n 40 .git/implement-proof.log`, then Grep that log for failures instead of printing it. Inside a worktree, use the directory `git rev-parse --git-dir` prints instead of `.git`. A reasoned argument is not completion: when logic changes in a repo with a test runner and no test ran, report *unverified*, not *done*.
6. **Retain project knowledge.** If proof revealed a build, test, or run command, or a failure-causing repository gotcha, missing from the documentation path named in Step 1, append one line there; with no such file, create nothing. Do not record session history: the ledger stays in the message, never in the repository.
7. **Fresh eyes.** Skip this step when the caller states that a pull-request review follows: that review is the one fresh look, and a second one splits the same findings across two contexts. Otherwise run the `code-review` skill at medium effort on its default target, the branch's commits and working tree, and fix each confirmed correctness finding under Step 5's proof; it reads the diff in a context of its own and reports only findings it is sure of. Request match, scope, and claimed proof stay with Step 8, because that skill takes no Goal. When `code-review` is absent, read `references/critique.md`, run the seven checks in order, and report that no separate context was available. Do not load `references/critique.md` earlier.
8. **Report.** State Goal, Decisions made during implementation, the ledger with final states, and Acceptance evidence. Do not restate the process or offer unrelated follow-up work.

## Breakers

Three conditions stop the loop and force an evidence report:

- A hook reports the context budget crossed. Finish the edit in progress at a green state, write the ledger with its states and the remaining edits to a file named implement-next.md under the directory `git rev-parse --git-dir` prints, report, and say a context clear comes next. The name carries no backticks because the skill verifier resolves a backticked `.md` token as a link.

- The same symptom survives two fix attempts. Report both attempts and observations; do not try a third variation of the same mechanism.
- A required edit lies outside the paths named during orientation or by the brief/plan. Report the path and dependency before touching it; name `parallel-implementer` as the route when that work belongs on its own branch.

## References

| File | Read it when |
|---|---|
| `references/critique.md` | Step 7 only, and only when `code-review` is absent. Do not load during orientation, ordering, or build. |
| `references/security.md` | After orientation and baseline, before the first affected test or production edit, only when changed behavior crosses authentication/authorization; tenant/resource ownership; secrets/credentials; untrusted input; network, file, or process execution; cryptography; or payments/regulated-data boundaries. Filenames and dependency names alone do not qualify. |
| `references/data-migration.md` | After orientation and before ordering, only when work changes a database schema, persisted-data or file format, backfill, destructive DDL, persisted-data deletion, or compatibility between concurrently deployed versions. In-memory types, cache rebuilds, and version-only dependency bumps do not qualify. |
| `references/test-design.md` | After the baseline and before adding or changing an automated test or production behavior, only when logic or public behavior changes or the request adds or changes an automated test, and the repository exposes an automated test runner. Style, text, and version-only changes do not qualify. |
| `references/performance.md` | A decided change targets speed only. Load before the measurement that precedes the first edit; do not load for correctness work. |
| `../research/scout-prompt.md` | Before a codebase discovery dispatch. |

## Precedence

`debug` owns an unproven failure until its cause is established. The frontend-design skill the executing session has loaded owns visual decisions during Build; this skill retains orientation, ordering, non-visual wiring, proof, critique, and reporting. A `general-purpose` delegate from `../research/scout-prompt.md` owns read-only discovery; `code-review` owns the review context. Design and structural decisions belong to the session on its expensive model; a Sonnet context builds the decided edits and reports when it needs a decision, rather than making one itself.

## From a plan

A plan written by `planning` runs here only when its tasks must build in this session; `implementing` runs one through delegated contexts and commits per task. Read `## Goal`, `## Plan basis`, `## Non-goals` and `## Context`, then the tasks one at a time in file order, extracted fence-aware between `### Task <n>:` headings. For each: confirm every `Modify:` region reads as the step implies, write each step's code, run its `Run:` to its `Expected:`, and run the task's `Commit:` block under the plan's authorization before the next. A region missing, duplicated or already changed is drift: stop and report `PLAN DRIFT: Task <n>`.

## Judgment

- Explicit user instructions outrank this skill.
- Settled brief or plan decisions outrank implementation defaults.
- A repair that crosses a second owner, keeps an old route beside the new one, or cannot be explained in one pass goes to `debug` instead of a further patch, because each sign says the cause is elsewhere.
- Repository test, build, naming, and review conventions outrank unspecified defaults here.
