---
name: ship
description: Use when a code-changing run ends with commits that may leave the machine, or the user asks to push, open, watch or merge a pull request, fix its failing checks or conflicts, or address its review comments. Not for reviewing code, a PR the user did not name or list, deleting a branch, or cutting a release.
argument-hint: "[pull request numbers]"
allowed-tools: Bash(node *repo-fields.mjs*)
---

# Shipping

1. **Authorize.** A letter, non-`ask` `ship` setting or merge request authorizes the route; watching or comments authorize only fix commits, push, replies — never force, `--no-verify`, or a relaxed gate or test.
2. **Overview**: outcome line, `Changed`, `Verified`, `Branch`, then the question; at most five `<what>: <why>` `Changed` lines, a skipped check in `Verified`.
3. **Ask.** Quote the stdout of `node "${CLAUDE_SKILL_DIR}/scripts/ship.mjs" --routes` as the menu; nothing leaves the machine before the letter. Exception: an `Unasked: push` line runs `--route push` before the question, never forced, and drops the menu's Push. Merge, default-branch push, release, delete, pull request, issue and comment wait. `no origin remote`/set `route: ` skips asking; unapplied `ship=` explains.
4. **PR body** for `open-pr`/`pr-merge` with `Closes #<n>`.
   With no issue, run `node "${CLAUDE_SKILL_DIR}/../file-issues/scripts/repo-fields.mjs"` and its `--size` form.
5. **Verify**, for `pr-merge`: hand the diff to `verify`. `PASS` or `PASS+NOTES` records verdict and `patch-id=` under `## Verification`; `FAIL` pushes nothing.
   Reuse a recorded verdict past `--verdict-current <patch-id>`; `stale` reruns it.
   An open pull request gets `gh pr edit <n> --body-file <f>`.
6. **Route.** `node "${CLAUDE_SKILL_DIR}/scripts/ship.mjs" --route <push|open-pr|pr-merge> --title <subject> --body <file> [--issue <n>] [--method squash|merge|rebase]` under `run_in_background`.
   Steps: push, open, wait for checks (stops after 20 minutes, exit 124), gate from the API, merge, confirm; `DIRTY` exits 4, other stops 1, asking `A · Resolve conflicts` or `B · Stop`, leaving it open.
   A resolve never uses `--strategy`/`-X`; a fix reruns step 5, never `--merge`.
   `open-pr` or a merge request stops after three fix rounds, watch included.
7. **Merge.** Print `gh pr list --json number,title,baseRefName,headRefName` in order; each gets a step 5 verdict via `gh pr view <n> --json headRefOid,baseRefName,title,body`; `FAIL` drops out.
   `node "${CLAUDE_SKILL_DIR}/scripts/ship.mjs" --merge <n...>` under `run_in_background` gates and merges each; a stop never halts others.
8. **Comments and watching.** Address via `references/pr-comments.md`; watch via `references/watch.md`, stopping at merge-ready — only an explicit merge moves to step 7.

## References

| File | Read it when |
|---|---|
| `../file-issues/references/fields.md` | Step 4 fields. |
| `../route-skills/references/question.md` | Step 3, `DIRTY`. |
| `references/pr-prep.md` | Step 4 body. |
| `references/fix-ci.md` | Failing check, watch. |
| `references/merge-conflicts.md` | Conflicts, step 6 or watch. |
| `references/pr-comments.md` | Comments. |
| `references/watch.md` | Watching. |

Report: one line per pull request: URL, merged or the stop and reason (branch for Push or Keep local), status via `gh pr view <n> --json state,isDraft`, `gh pr ready <n>` if draft, `git worktree remove <path>` if merged.
