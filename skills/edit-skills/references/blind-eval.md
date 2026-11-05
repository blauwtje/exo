# Blind eval

A blind eval lets a judge pick the stronger of two answers without knowing which clone wrote which, so the verdict cannot favor the edit.

## When to run it

- Run it when step 4's `with` and `without` read is a close call: both answers could pass for the same reason, or the `with` answers only read more thorough.
- Skip it for a brand-new case's first pass. Step 4 already proves it when `without` fails and `with` passes.

## Steps

1. Get two clones: the pre-edit worktree (or the commit before the change) as baseline, and the edited worktree as changed.
2. Judge the stored `with` answers of both clones. When the user asks for a run, or a clone has none, run `pressure.mjs --prompt <the same case file> --cells <cell> --plugin-dir <clone>` once per clone.
3. Read the full `with` answer files only, because each clone's `without` answers are the same skill-less answers twice.
4. Label the two clones' `with` answers A and B. Alternate which letter holds the changed answers so no pattern forms across evals, and keep the mapping yourself.
5. Copy the labels and full answer texts into a scratch file for the judge. Leave "baseline", "changed", "old" and "new" out of it, since they unmask the labels.
6. Write a rubric of 3-6 concrete criteria for what the edit was meant to fix.
7. Spawn a fresh `general-purpose` delegate whose prompt opens with `exo-kind: review` as judge, holding the case prompt, the rubric and the labeled file, with `Reads: <the labeled file>` and `Worktree: <abs path>` on lines of their own. It scores each label against the rubric and picks the stronger.
8. Unmask the labels against the pick. The edit is done only when the judge picked the changed answer for the reason the rubric names.
9. On a tie or a baseline win, return to loop step 3 (Choose the home), because the wording did not move the behavior.
