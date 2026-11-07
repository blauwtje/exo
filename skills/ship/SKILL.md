---
name: ship
description: Use when commits may leave the machine, or the user asks to push, open, watch or merge a pull request or fix its failing checks, conflicts or review comments. Not for reviewing code, an unnamed PR, or a release.
argument-hint: "[pull request numbers] [--land]"
allowed-tools: Bash(node *repo-fields.mjs*)
---

# Ship

Goal: ship only as the user says.

1. **Authorize.** Letter, non-`ask` `ship` setting or merge request authorizes the route.
   - Watching or comments authorize only fix commits, push and replies, not force, `--no-verify` or a relaxed gate/test.
2. **Overview**: `../route-skills/references/closing.md`, three lines, then the question.
   - `Changed`, `Verified` go only to run report.
   - From `gate`, its lines replace overview.
   - Then read `references/overview-extras.md`.
3. **Ask.** Quote the stdout of `node "${CLAUDE_SKILL_DIR}/scripts/ship.mjs" --routes` as the menu; nothing leaves the machine before the letter.
   - Read `references/ask-menu.md` for routes the menu skips.
   - A set `route: ` skips asking; explain an unapplied `ship=`.
   - `--land` → take the menu's (A) with no question.
4. **PR body** for `open-pr`/`pr-merge` with `Closes #<n>`.
   - No issue: `node "${CLAUDE_SKILL_DIR}/../file-issues/scripts/repo-fields.mjs"` and its `--size` form.
5. **Verify**, for `pr-merge`: hand diff to `gate`; `FAIL` pushes nothing.
   - Record or reuse verdict: `references/pr-merge.md`.
6. **Route.** `node "${CLAUDE_SKILL_DIR}/scripts/ship.mjs" --route <push|open-pr|pr-merge> --title <subject> --body <file> [--issue <n>] [--method squash|merge|rebase]` under `run_in_background`.
   - Push, open, wait for checks (stops after 20 minutes, exit 124; read output at least every 10 min), gate from API, merge, confirm.
   - After a fix, rerun 5; no `--merge`.
7. **Merge.** List and verify each: `references/pr-merge.md`.
   - `node "${CLAUDE_SKILL_DIR}/scripts/ship.mjs" --merge <n...>` under `run_in_background` gates and merges each. A stop halts no other.
8. **Comments and watching** per their references.

## References

| File | Read it when |
|---|---|
| `../file-issues/references/fields.md` | 4 fields. |
| `../route-skills/references/question.md` | 3, `DIRTY`. |
| `references/pr-prep.md` | 4 body. |
| `references/overview-extras.md` | 2. |
| `references/ask-menu.md` | 3. |
| `references/commit-split.md` | Dirty tree. |
| `references/stack.md` | Stacked PRs. |
| `references/fix-ci.md` | Failing check, watch. |
| `references/merge-conflicts.md` | Conflicts, 6, watch. |
| `references/pr-comments.md` | Comments, watch. |
| `references/watch.md` | Watching. |
| `references/pr-merge.md` | 5, 7. |
| `../route-skills/references/closing.md` | Before the report. |

Report: each line `ship.mjs` prints, checkout line (branch for Keep local), status `gh pr view <n> --json state,isDraft`, `gh pr ready <n>` if draft, if merged `node "${CLAUDE_SKILL_DIR}/../build/scripts/remove-worktree.mjs" --kept --worktree <path> --run .`, refused → leave it, report it.
