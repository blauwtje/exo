---
name: ship
description: "Use when a run ends with commits that may leave the machine, or the user asks to push, open, watch or merge a pull request, or fix its failing checks, conflicts or review comments. Not for reviewing code, a PR the user did not name, or a release."
---

# Shipping

1. **Authorize.** A letter, non-`ask` `ship` setting or merge request authorizes the route.
   - Watching or comments authorize only fix commits, push and replies, never force, `--no-verify`, or a relaxed gate or test.
2. **Overview**: outcome line, `Changed`, `Verified`, `Branch`, then the question.
   - At most five `<what>: <why>` `Changed` lines, a skipped check in `Verified`.
3. **Ask.** Quote the stdout of `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/skills/ship/scripts/ship.mjs" --routes` as the menu; nothing leaves the machine before the letter.
   - Exception: an `Unasked: push` line runs `--route push` before the question, never forced, and drops the menu's Push.
   - A set `route: ` skips asking; an unapplied `ship=` is explained.
4. **PR body** for `open-pr`/`pr-merge` with `Closes #<n>`.
   - With no issue, run `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/skills/file-issues/scripts/repo-fields.mjs"` and its `--size` form.
5. **Verify**, for `pr-merge`: hand the diff to `verify`; `FAIL` pushes nothing.
   - `PASS` or `PASS+NOTES` records verdict and `patch-id=` under `## Verification`, by `gh pr edit <n> --body-file <f>` on an open pull request.
   - Reuse a recorded verdict past `--verdict-current <patch-id>`; `stale` reruns it.
6. **Route.** `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/skills/ship/scripts/ship.mjs" --route <push|open-pr|pr-merge> --title <subject> --body <file> [--issue <n>] [--method squash|merge|rebase]` in a background `exec_command` session polled with `write_stdin`.
   - Steps: push, open, wait for checks (stops after 20 minutes, exit 124), gate from the API, merge, confirm.
   - `DIRTY` exits 4, other stops 1, asking `(A) Resolve conflicts` or `(B) Stop`, leaving it open.
   - A fix reruns step 5, never `--merge`.
   - `open-pr` or a merge request stops after three fix rounds, watch included.
7. **Merge.** Print `gh pr list --json number,title,baseRefName,headRefName` in order.
   - Each gets a step 5 verdict via `gh pr view <n> --json headRefOid,baseRefName,title,body`; `FAIL` drops out.
   - `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/skills/ship/scripts/ship.mjs" --merge <n...>` in a background `exec_command` session polled with `write_stdin` gates and merges each; a stop never halts others.
8. **Comments and watching.** A watch stops at merge-ready; only an explicit merge moves to step 7.

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

Report: each line `ship.mjs` prints, the checkout line included (branch for Keep local), status via `gh pr view <n> --json state,isDraft`, `gh pr ready <n>` if draft, `git worktree remove <path>` if merged.
