---
name: ship
description: Use when commits may leave the machine, or the user asks to push, open, watch or merge a pull request or fix its failing checks, conflicts or review comments. Not for reviewing code, an unnamed PR, or a release.
argument-hint: "[pull request numbers] [--land]"
allowed-tools: Bash(node *repo-fields.mjs*)
---

# Shipping

1. **Authorize.** A letter, non-`ask` `ship` setting or merge request authorizes the route.
   - Watching or comments authorize only fix commits, push and replies, never force, `--no-verify`, or a relaxed gate or test.
2. **Overview**: the session's report rule, three lines, then the question.
   - `Changed` and `Verified` lines go to the run report, left out when none exists.
   - Invoked by `verify` → its three lines replace the overview.
   - Run `node "${CLAUDE_SKILL_DIR}/../remember/scripts/memory.mjs" propose --count`; above 0 adds the line `Lessons: <n> ready: /exo:remember`, beside the three lines; 0 or a failing command adds none.
3. **Ask.** Quote the stdout of `node "${CLAUDE_SKILL_DIR}/scripts/ship.mjs" --routes` as the menu; nothing leaves the machine before the letter.
   - Exception: an `Unasked: push` line runs `--route push` before the question, never forced, and drops the menu's Push.
   - A set `route: ` skips asking; an unapplied `ship=` is explained.
   - `--land` → take the menu's (A) with no question.
4. **PR body** for `open-pr`/`pr-merge` with `Closes #<n>`.
   - No issue → run `node "${CLAUDE_SKILL_DIR}/../file-issues/scripts/repo-fields.mjs"` and its `--size` form.
5. **Verify**, for `pr-merge`: hand the diff to `verify`; `FAIL` pushes nothing.
   - Record or reuse a verdict per `references/pr-merge.md`.
6. **Route.** `node "${CLAUDE_SKILL_DIR}/scripts/ship.mjs" --route <push|open-pr|pr-merge> --title <subject> --body <file> [--issue <n>] [--method squash|merge|rebase]` under `run_in_background`.
   - Steps: push, open, wait for checks (stops after 20 minutes, exit 124), gate from the API, merge, confirm.
   - `DIRTY` exits 4, other stops 1, asking `(A) Resolve conflicts` or `(B) Stop`, leaving it open.
   - A fix → rerun step 5, never `--merge`.
   - `open-pr` or a merge request stops after three fix rounds, watch included.
7. **Merge.** List and verify each per `references/pr-merge.md`.
   - `node "${CLAUDE_SKILL_DIR}/scripts/ship.mjs" --merge <n...>` under `run_in_background` gates and merges each; a stop never halts others.
8. **Comments and watching** per their references.

## References

| File | Read it when |
|---|---|
| `../file-issues/references/fields.md` | Step 4 fields. |
| `../route-skills/references/question.md` | Step 3, `DIRTY`. |
| `references/pr-prep.md` | Step 4 body. |
| `references/fix-ci.md` | Failing check, watch. |
| `references/merge-conflicts.md` | Conflicts, step 6 or watch. |
| `references/pr-comments.md` | Comments, watch. |
| `references/watch.md` | Watching. |
| `references/pr-merge.md` | Steps 5 and 7. |

Report: each line `ship.mjs` prints, the checkout line included (branch for Keep local), status via `gh pr view <n> --json state,isDraft`, `gh pr ready <n>` if draft, `git worktree remove <path>` if merged.
