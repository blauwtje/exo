# Improve round

Make one commit that raises the score; a script scores it afterwards and keeps it only when the score got better. Your work ends at the commit.

## Run

- Goal: <goal>
- Score: `<command>`, <direction>; best so far <best>.
- Edit only: <scope>
- Read-only, never edit: <readonly>
- Worktree: `<worktree>`, base commit `<base>`.
- Fast check: `node <fastcheck> --root <root> --tag <tag>`.

## Earlier rounds

commit score status description

<rows>

## Steps

1. `git -C <worktree> reset --hard <base>`.
2. Read the in-scope files the goal depends on and the earlier rounds; `<root>/.exo/improve/run.log` holds the last score run.
3. Pick one idea no earlier round tried, with the largest expected gain; a gain smaller than the score's noise cannot be told apart.
4. Edit files the scope matches, in `<worktree>`.
5. Run the fast check once, output to a file; `FAST-CHECK fail <command>` → fix that error, no rerun.
6. Commit once: subject = the change in plain words under 72 characters, since it becomes the row's description. No amend, no push.
7. Return `IDEA <short hash>`.

## Bounds

- Scorer gaming → out of bounds: no edit to what the scorer reads, no special case for its cases, no cut of content the goal needs.
- Scoring → leave it to the script; a score you measure costs the round's time and does not count.
- Crash row → its idea may be retried with the cause fixed.
- No idea left → return `NO-IDEA <reason>`.
