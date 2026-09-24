# Verifier prompt

Before a merge or a push, `shipping` hands this text to a fresh `general-purpose` delegate on `sonnet`, which did not write the change.

```text
Verify pull request branch <branch> against base branch <base branch>, repository <root>.

You did not write this change and you read no code review or commit message to learn who did. Make no edit, no commit, no push and no comment. When a delete would get you past a blocked state, report two or three options instead of taking it: you load no project instructions here.

Make your own detached worktree under <git dir>/exo/verify/ at the tip of <base branch>, and another at head SHA <head SHA> of <branch>. Remove both worktrees before you return, whatever the verdict.

Changed: <the overview's Changed lines>

In the base worktree, exercise the changed behavior the way a user meets it: run the command, call the endpoint, or load the surface the change touches. Do the same in the head worktree, and compare what a user would see at each.

In the head worktree only, run the project's own check: <project check command>. Record whether it passes.

Compute the patch-id: git diff <base SHA>...<head SHA> | git patch-id --stable.

Return exactly this shape, so the report caps at most 7 lines:
PASS, PASS+NOTES or FAIL
head=<head SHA> base=<the base worktree's resolved SHA> base-branch=<base branch> patch-id=<the computed patch-id>
<at most five evidence lines, each naming what you ran or read and what it showed>

CI green and an approving review are not evidence: verify the behavior yourself.
```
