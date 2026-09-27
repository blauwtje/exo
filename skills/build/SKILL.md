---
name: build
description: Use when a session opens on a plan file to run, after a clear, or the user says to run or resume a plan, or a decided change this session touches over two files, a dependency, a public signature, a persisted format or security boundary, or is test-first. Not for authoring or repairing a plan, another change of at most two files, a version bump, or an unproven failure.
argument-hint: "[plan path]"
effort: medium
---

# Implementing a plan

## The loop

Read `references/run-loop.md` for steps 1-6: finding the plan, reading the frame, asking the branch what landed, forming the block, dispatching the unit and routing the return. Its step 3 sends a `Next: none` result here for step 7.

7. **The tail.** Read `references/tail.md`: it reviews the branch, runs the plan's final verification and closes on `ship`.

## No spec

A decided change with no plan file runs the eight steps in `references/no-spec.md` instead of the loop above.

## References

| File | Read it when |
|---|---|
| `references/run-loop.md` | The loop, steps 1-6. |
| `references/tail.md` | The loop, step 7, once step 3 reports `Next: none`. |
| `references/no-spec.md` | No spec, when there is no plan file. |
| `references/workspace.md` | Step 1 before the first dispatch, or No spec step 3. |
| `references/wave-worktrees.md` | Never here: `exo:run-unit` reads it. |
| `implementer-prompt.md` | Never here: the unit reads it. |
| `drift-repairer-prompt.md` | Never here: the unit reads it. |
| `bug-fixer-prompt.md` | Step 7, on a failed check. |
| `review-fixer-prompt.md` | Step 7, on a `FINDINGS` verdict. |
| `references/design-tasks.md` | Step 4, for a task with a `Design:` line. |
| `reviewer-prompt.md` | No spec step 7. |
| `references/fresh-eyes.md` | No spec step 7. |
| `references/critique.md` | No spec step 7's last fallback. |
| `references/security.md` | No spec, when its first line applies. |
| `references/data-migration.md` | No spec, when its first line applies. |
| `references/test-design.md` | No spec step 5. |
| `references/test-first.md` | No spec, test-first work, before naming the first boundary. |
| `references/project-knowledge.md` | No spec step 6, when its first line applies. |
| `references/performance.md` | No spec, speed-only work, before measuring. |
| `../route-skills/references/question.md` | Before asking the user to pick among numbered options. |

Report: `ship`'s overview as this turn's one report, ending with the brief's `## Manual checks`.
