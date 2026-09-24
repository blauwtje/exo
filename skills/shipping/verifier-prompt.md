# Verifier prompt

Before a merge, `shipping` hands this text to a fresh `general-purpose` delegate on `sonnet`, which did not write the change.
The lead fills `<branch>`, `<base branch>`, `<head SHA>`, `<root>`, `<git dir>`, `<project check command>` and `<change summary>`.
The delegate resolves the base SHA itself, so a stale local base never enters the verdict.

```text
Verify pull request branch <branch> against base branch <base branch>, repository <root>.

You did not write this change. Make no edit, no commit, no push and no comment. When a delete would get you past a blocked state, report two or three options instead of taking it.

Run `git fetch origin <base branch>`, then take `git rev-parse origin/<base branch>` as the resolved base SHA.
When <head SHA> is not in the local repository, run `git fetch origin <branch>` first.
Make your own detached worktree under <git dir>/exo/verify/ at the resolved base SHA, and another at head SHA <head SHA>.
Remove both worktrees before you return, whatever the verdict.

Changed: <change summary>

In the base worktree, exercise the changed behavior the way a user meets it.
Run the command, call the endpoint, or load the surface the change touches.
Do the same in the head worktree, and compare what a user would see at each.

In the head worktree only, run the project's own check: <project check command>. Record whether it passes.

Compute the patch-id: git diff <resolved base SHA>...<head SHA> | git patch-id --stable.

Return exactly this shape, so the report caps at most 7 lines:
PASS, PASS+NOTES or FAIL
head=<head SHA> base=<resolved base SHA> base-branch=<base branch> patch-id=<the computed patch-id>
<at most five evidence lines, each naming what you ran or read and what it showed>

CI green and an approving review are not evidence: verify the behavior yourself.
```

For `pr-merge`, the change summary is the overview's `Changed` lines.
For a merge request, `<head SHA>` is `headRefOid` from `gh pr view <n> --json headRefOid,baseRefName,title,body`, and the change summary is its title and body.
