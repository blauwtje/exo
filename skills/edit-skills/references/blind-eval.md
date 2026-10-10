# Blind eval

## When to run it

- Step 4's `with`/`without` read is a close call: both answers could pass for the same reason, or the `with` answers only read more thorough.
- Not for a brand-new case's first pass: step 4 already proves it; `without` failing and `with` passing need no judge.

## Steps

1. Get two clones: pre-edit worktree (or the commit before the change) as baseline, edited worktree as changed.
2. Stored `with` answers for both clones → judge those. The user asks for a run, or a clone has none → run `pressure.mjs --prompt <the same case file> --cells <cell> --plugin-dir <clone>` once per clone.
3. Read only the `with` answer files (full, untruncated); each clone's `without` answers are the same skill-less answers twice.
4. Label the two clones' `with` answers A and B, alternating which letter holds the changed answers so no pattern forms across evals; keep the mapping yourself.
5. Copy only the labels and full answer texts into a scratch file for the judge; never write "baseline", "changed", "old" or "new" into it.
6. Write a rubric of 3-6 concrete criteria for what the edit was meant to fix.
7. Spawn a fresh sonnet delegate as judge with the case prompt, rubric and labeled file; it scores each label against the rubric and picks the stronger, blind to which is which.
8. Unmask labels against the pick; edit done only when the judge picked the changed answer for the reason the rubric names.
9. Tie or baseline wins → return to loop step 3 (Choose the home); the wording did not move the behavior.
