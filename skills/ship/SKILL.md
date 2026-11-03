---
name: ship
description: Use when commits may leave the machine, or the user asks to push, open, watch or merge a pull request or fix its failing checks, conflicts or review comments. Not for reviewing code, an unnamed PR, or a release.
argument-hint: "[pull request numbers] [--land]"
allowed-tools: Bash(node *repo-fields.mjs*)
---

# Ship

Goal: ship only as the user says.

1. **Authorize.** Letter, non-`ask` `ship` setting or merge request authorizes the route.
   - Watching or comments authorize only fix commits, push and replies, not force, `--no-verify` or a relaxed gate or test.
2. **Overview**: `../route-skills/references/closing.md`, three lines, then the question.
   - `Changed` and `Verified` go only to run report, if one exists.
   - Invoked by `gate` → its lines replace overview.
   - Run `node "${CLAUDE_SKILL_DIR}/../remember/scripts/memory.mjs" propose --count`; above 0 add `Lessons: <n> ready: /exo:remember`.
   - A named follow-up adds `Follow-up: <what>, no issue filed; say so to file one`. No `gh issue create` before that yes.
3. **Ask.** Quote the stdout of `node "${CLAUDE_SKILL_DIR}/scripts/ship.mjs" --routes` as the menu; nothing leaves the machine before the letter.
   - Exception: an `Unasked: push` line runs `--route push` unforced before the question, dropping the menu's Push.
   - Plan `Land:` from `gate` sets the route, no question: `push-main` → `push`, `pr` → `open-pr`, `local` → no route.
   - A set `route: ` skips asking; unapplied `ship=` is explained.
   - `--land` → take the menu's (A) with no question.
4. **PR body** for `open-pr`/`pr-merge` with `Closes #<n>`.
   - No issue → `node "${CLAUDE_SKILL_DIR}/../file-issues/scripts/repo-fields.mjs"` and its `--size` form.
5. **Verify**, for `pr-merge`: hand diff to `gate`; `FAIL` pushes nothing.
   - Record or reuse verdict per `references/pr-merge.md`.
6. **Route.** `node "${CLAUDE_SKILL_DIR}/scripts/ship.mjs" --route <push|open-pr|pr-merge> --title <subject> --body <file> [--issue <n>] [--method squash|merge|rebase]` under `run_in_background`.
   - Push, open, wait for checks (stops after 20 minutes, exit 124; read output at least every 10 min), gate from API, merge, confirm.
   - After a fix, rerun step 5; no `--merge`.
7. **Merge.** List and verify each per `references/pr-merge.md`.
   - `node "${CLAUDE_SKILL_DIR}/scripts/ship.mjs" --merge <n...>` under `run_in_background` gates and merges each. A stop halts no other.
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
| `references/pr-merge.md` | 5, 7. |
| `../route-skills/references/closing.md` | Before the final message. |

Report: each line `ship.mjs` prints, checkout line (branch for Keep local), status `gh pr view <n> --json state,isDraft`, `gh pr ready <n>` if draft, if merged `node "${CLAUDE_SKILL_DIR}/../build/scripts/remove-worktree.mjs" --kept --worktree <path> --run .`, refused → leave it, report it.
