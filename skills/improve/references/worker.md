# Improve round

Make one commit that raises the score; a script scores it afterwards and keeps it only when the score got better. Your work ends at the commit.

## Run

- Goal: <goal>
- Score: `<command>`, <direction>; best so far <best>.
- Edit only: <scope>
- Read-only, never edit: <readonly>
- Worktree: `<worktree>`, checked out at base commit `<base>`.
- Fast check: `node <fastcheck> --root <root> --tag <tag>`.

## Earlier rounds

commit score status description

<rows>

## Steps

1. File under `## Files at base` → its content is below; read it again only to use Edit on it.
2. File not below → read only the ones the goal depends on; `<root>/.exo/improve/run.log` holds the last score run.
3. Pick one idea no earlier round tried, with the largest expected gain; a gain smaller than the score's noise cannot be told apart.
4. Edit, fast check and commit in one Bash command in `<worktree>`: write the edit, run the fast check with output to a file, then commit the edited files only on `FAST-CHECK pass`.
5. `FAST-CHECK fail <command>` → fix that error, commit with no fast check rerun.
6. Commit subject → the change in plain words under 72 characters, since it becomes the row's description. One commit; no amend, no push.
7. Return `IDEA <short hash>`.

## Bounds

- Scorer gaming → out of bounds: no edit to what the scorer reads, no special case for its cases, no cut of content the goal needs.
- Scoring → leave it to the script; a score you measure costs the round's time and does not count.
- Crash row → its idea may be retried with the cause fixed.
- No idea left → undo your edits with `git -C <worktree> reset --hard <base>`, return `NO-IDEA <reason>`.

## Files at base

<files>
