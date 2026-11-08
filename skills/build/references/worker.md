# Improve round

Make one commit that raises the score; a script scores it afterwards and keeps it only when its gain clears the score's noise. Your work ends at the commit.

## Run

- Goal: <goal>
- Score: `<command>`, <direction>, with best so far <best> and the smallest gain the keep rule detects <mde>.
- Edit only: <scope>
- Read-only, do not edit: <readonly>
- Worktree: `<worktree>`, checked out at base commit `<base>`.
- Fast check: `node <fastcheck> --root <root> --tag <tag>`.

## Earlier rounds

commit score status description

<rows>

## Last round

<last>

## Steps

1. A file under `## Files at base` has its content below. Read it again only to use Edit on it.
2. For a file not below, read only the ones the goal depends on. `<root>/.exo/improve/run.log` holds the last score run and `<root>/.exo/improve/<tag>.logs/` holds every run.
3. Read `## Last round` before the idea: its `CASES` line names the cases that moved most, its `OUT` lines what the score printed.
4. Pick one idea no earlier round tried, with the largest expected gain; a gain under the smallest detectable gain cannot be told apart from noise.
5. Simpler wins at an equal score: a removal that keeps the score is a win; a gain near the smallest detectable gain that adds much code is not worth it. Each row's `lines=+<added>/-<removed>` shows its size.
6. Edit, fast check and commit in one Bash command in `<worktree>`: write the edit, run the fast check with output to a file, then commit the edited files only on `FAST-CHECK pass`.
7. On `FAST-CHECK fail <command>`, fix that error and commit without rerunning the fast check.
8. Write the commit subject as the change in plain words under 72 characters, since it becomes the row's description. Make one commit, with no amend and no push.
9. Return `IDEA <short hash>`.

## Bounds

- Scorer gaming is out of bounds: do not edit what the scorer reads, add a special case for its cases or cut content the goal needs.
- Leave scoring to the script, because a score you measure costs the round's time and does not count.
- After a crash row, its idea may be retried with the cause fixed.
- With no idea left, undo your edits with `git -C <worktree> reset --hard <base>` and return `NO-IDEA <reason>`.

## Files at base

<files>
