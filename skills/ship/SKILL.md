---
name: ship
description: Use when a code-changing run ends with commits that may leave the machine, or the user asks to push, open, watch or merge a pull request, fix its failing checks or conflicts, or address its review comments. Not for reviewing code, a PR the user did not name or list, deleting a branch, or cutting a release.
argument-hint: "[pull request numbers]"
allowed-tools: Bash(node *repo-fields.mjs*)
---

# Shipping

1. **Know what is authorized.** The picked digit, a `ship` setting other than `ask`, or a merge request authorizes that route or those merges to their end.
   Watching or addressing review comments authorizes fix commits, their plain push and replies, never the merge.
   Nothing authorizes deleting a branch no instruction names, forcing, `--no-verify`, relaxing a gate or test, or a release.
2. **Write the overview** in the user's language: an outcome line, `Changed`, `Verified` and `Branch` lines, the question under it.
   `Changed` holds at most five `<what>: <why>` lines; a check not run gets its own `Verified` line; no table or plan recap.
3. **Ask the question.** Quote the stdout of `node "${CLAUDE_SKILL_DIR}/scripts/ship.mjs" --routes` as the menu; nothing leaves the machine before the digit.
   One line means no route can run: end with no question.
   `route: ` names the set route, run unasked; `ship=` says why the setting did not apply.
   Pushing release steps still wait for this answer.
4. **Write the pull request body**, for `open-pr` and `pr-merge`, after reading `references/pr-prep.md`, with `Closes #<n>` for work from issue `<n>`.
   With no issue behind it, run `node "${CLAUDE_SKILL_DIR}/../file-issues/scripts/repo-fields.mjs"` and its `--size` form for the fields.
5. **Verify**, for `pr-merge`: hand `verifier-prompt.md` to a fresh `general-purpose` delegate on `sonnet`, because the writer's proof misses what it never exercised.
   `PASS` or `PASS+NOTES` puts its verdict and `patch-id=` lines under `## Verification`; `FAIL` pushes nothing, even with green checks.
   Before reusing a recorded verdict, run `node "${CLAUDE_SKILL_DIR}/scripts/ship.mjs" --verdict-current <patch-id>`; `stale` reruns this step.
   On an open pull request, write the new verdict with `gh pr edit <n> --body-file <f>`, because a rerun never resends `--body`.
6. **Run the route.** `node "${CLAUDE_SKILL_DIR}/scripts/ship.mjs" --route <push|open-pr|pr-merge> --title <conventional subject> --body <file> [--issue <n>] [--method squash|merge|rebase]` under `run_in_background`; quote its stdout.
   Its steps: push, open, wait for checks (stops after 20 minutes, exit 124), gate from the API, merge, confirm; `DIRTY` exits 4, other stops 1.
   `DIRTY` always asks, setting or not: `1. **Resolve conflicts (Recommended)**` or `2. **Stop**: leave the pull request open`.
   A resolve follows `references/merge-conflicts.md`, never `--strategy` or `-X`, which pick a side unread; step 5 and the command then rerun.
   A failing check on `pr-merge` follows `references/fix-ci.md`, then reruns step 5 and `--route pr-merge`, never `--merge`, which skips the wait.
   `open-pr` and a merge request fix nothing; stop, leaving it open, after three fix rounds per pull request, watch included.
7. **Merge on request.** Print `gh pr list --json number,title,baseRefName,headRefName` in the user's order or the list's before acting.
   Each gets a step 5 verdict read from `gh pr view <n> --json headRefOid,baseRefName,title,body`; a `FAIL` drops out to the report.
   Then `node "${CLAUDE_SKILL_DIR}/scripts/ship.mjs" --merge <n...>` under `run_in_background` gates and merges each; one stop never halts the rest.
8. **Review comments and watching.** Addressing comments starts from `references/pr-comments.md`.
   Watching runs the rounds of `references/watch.md` and stops at merge-ready; only an explicit merge request moves on to step 7.

## References

| File | Read it when |
|---|---|
| `../file-issues/references/fields.md` | Step 4, for the body's fields. |
| `../route-skills/references/question.md` | Step 3 and the `DIRTY` question. |
| `references/pr-prep.md` | Step 4, before the body. |
| `verifier-prompt.md` | Step 5. |
| `references/fix-ci.md` | A check fails in `pr-merge` or a watch round. |
| `references/merge-conflicts.md` | Resolve conflicts, in step 6 or a watch round. |
| `references/pr-comments.md` | Review comments are to be addressed. |
| `references/watch.md` | The user asks to watch a pull request. |

Report: one line per pull request, its URL then merged or the stop and reason (the branch for Push or Keep local), each status read then from `gh pr view <n> --json state,isDraft`, a draft marked `gh pr ready <n>`, and a `git worktree remove <path>` line for a merged branch's worktree.
