# Blind eval

Reading the `with`/`without` answers yourself grades your own change, and a close
call reads as a pass because you already want it to. The enemy is the wording
tweak declared done on a self-read hunch. The overcorrection is running this
on every case, which is too slow to survive the loop.

## When to run it

- Step 4's `with`/`without` read is a close call: both answers could pass for
  the same reason, or the `with` answers only read more thorough.
- Not for a brand-new case's first pass: step 4 already proves that one, because
  the `without` answers failing and the `with` answers passing need no judge.

## Steps

1. Get two clones: the pre-edit worktree (or the commit before the change) as
   baseline, the edited worktree as changed.
2. Run `pressure.mjs --prompt <the same case file> --cells <cell> --plugin-dir
   <clone>` once per clone; each clone's `without` answers are the same
   skill-less answers twice over, so read only the `with` answer files, which
   hold each full answer untruncated.
3. Label the two clones' `with` answers A and B, alternating which letter
   holds the changed answers so no pattern forms across repeated evals, and
   copy only the label and the full answer texts into a scratch file the
   judge will see; keep the mapping yourself and never write "baseline", "changed", "old" or "new"
   into that file.
4. Write a rubric of 3-6 concrete criteria for what the edit was meant to fix,
   then spawn a fresh sonnet delegate as judge with the case prompt, the
   rubric and the labeled file; it scores each label against the rubric and
   picks the stronger, blind to which is which.
5. Unmask the labels against the judge's pick. The edit is done only when the
   judge picked the changed answer for the reason the rubric names; a tie or
   the baseline winning means the wording did not move the behavior, so
   return to step 3 of the loop (Choose the home) instead of declaring it
   done.

## Judgment

- The judge's blind pick outranks your own read of the `with`/`without`
  answers, because a close call is exactly what your own read cannot referee.
- One case judged with a clean label outranks several judged with a label
  that leaked "old" or "new".
