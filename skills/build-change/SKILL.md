---
name: build-change
description: "Use when a decided change built this session touches over two files, a dependency, a public signature, a persisted format or security boundary, or is test-first: TDD, a bug with a reproduction. Not for a plan file, another change of at most two files, a version bump, or an unproven failure."
argument-hint: <decided change>
---

# Implement

1. **Orient.** A main session runs `node "${CLAUDE_SKILL_DIR}/../../lib/scratch-exclude.mjs"`. Resume from `<scratch>/implement-next.md` if present (`<scratch>` is what `node "${CLAUDE_SKILL_DIR}/../../lib/scratch-path.mjs"` prints), deleting it once edits land. Read only the ranges a plan task's `Files:` lines or the request name. Otherwise, or when one direct search failed, dispatch `exo:locate-code` and read only its `Read next` ranges plus direct callers or callees. Treat upstream Decisions as settled.
2. **Gate.** Count these facts: over two source, test or config files change; a dependency is added; a public signature changes; a persisted format or security boundary is crossed; orientation missed a required file. Zero facts: edit directly, run the check, report, and stop. A test-first request continues at any count, because the direct route has no red run. Otherwise draw `A → B` when edit B cannot land green before A; two or more edges go to `define-scope` unless a brief orders them.
3. **Settle the workspace, then the baseline.** Before the first edit, settle where the change commits as `../run-plan/references/workspace.md` says, stopping until the answer when it asks. When more than one file will change, confirm the working tree is clean or name its pre-existing changed paths.
4. **Build.** Edit in dependency order without asking between files in scope. A hand edit repeated across many files becomes one script, and every mutating edit stays idempotent so retries land the same state. After a compaction, rebuild what landed from the working-tree diff, not memory. Report a required edit outside oriented paths before touching it. When a hook reports the context budget crossed, write landed and remaining edits to `<scratch>/implement-next.md` at a green state and report that a clear comes next.
5. **Prove.** A risky change per `references/test-design.md` quotes the failing output before the first production edit and the passing output after. A test-first bug commits its failing test alone, because a test committed with its fix never shows it failed. Otherwise exercise the feature, else run a test that failed before, else type check and build. Run each runner unpiped and without `cd &&`, which hide the failing command. *Done* needs that proof's output; an argument or a skipped check is *unverified*. When a symptom survives two fix attempts or a repair crosses a second owner, report both and hand it to `find-cause`.
6. **Retain project knowledge.** Follow `references/project-knowledge.md`.
7. **Fresh eyes.** Skip when the caller says a pull-request review follows, or when `node "${CLAUDE_SKILL_DIR}/../../lib/size-facts.mjs"` ends with `small`. Otherwise dispatch a `general-purpose` delegate on the session's model from `reviewer-prompt.md` with request, repository root and effort (`low` up to five changed files or 200 changed lines, else `medium`). On `BLOCKED`, report it and leave the review open. On `FINDINGS`, read only batch-review.md and, per `fix` finding, only its `file:start-end` range; fix it under step 5's proof and append `fixed` or `reported: <reason>`. Without a delegate, run `code-review`, else `references/critique.md`, and report that no separate context was available.
8. **Commit, then finish.** Commit where step 3 placed it, leaving out its pre-existing paths, then end on `ship`.

## References

| File | Read it when |
|---|---|
| `../run-plan/references/workspace.md` | Step 3. |
| `reviewer-prompt.md` | Step 7, before the dispatch. |
| `references/critique.md` | Step 7, without a delegate or `code-review`. |
| `references/security.md` | When its first line applies. |
| `references/data-migration.md` | When its first line applies. |
| `references/test-design.md` | When its first line applies. |
| `references/test-first.md` | A test-first change, before naming the first boundary. |
| `references/project-knowledge.md` | Step 6, when its first line applies. |
| `references/performance.md` | A speed-only change, before measuring. |
| `../route-skills/references/question.md` | Before asking the user to pick among numbered options. |

Report: goal met, commit SHA, proof command and output, one line per decision for the user, a brief's `## Manual checks`, open review findings, and the one open action.
