# save-session

Saves an unfinished session's live state to a file the next session reads.

## When it fires

Only when you invoke it. Claude never starts it, because only you know the session is about to end.

## What you get

- One file holding the goal, the current state, the decisions and who made them, what is proven, and the single next step.
- The file stored beside the branch it belongs to, so a session on that branch is pointed at it on startup.
- A commit recorded in it, so a session reading it later can say whether the tree has moved on.

## Where its rules live

`skills/save-session/SKILL.md`. Finished work needs no handoff: the commit and the pull request already record it.
