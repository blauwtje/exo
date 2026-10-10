# Rolling window

`run-unit` starts the next ready task as soon as one lands, instead of waiting for a whole wave. Each slot is one task in its own worktree. The worktree steps are "wave worktrees step 1, 3, 4", applied to one slot at a time.

1. **Baseline.** Before the first slot, record the run checkout's `git status --porcelain` once.
2. **Open a slot.**
   - Record the slot's own `<base>`.
   - Create its worktree per wave worktrees step 1.
   - Failed `git worktree add` or setup → close the window to refills; the current task builds alone in the run's checkout.
3. **Land.**
   - Green slot → land it alone per wave worktrees step 3 for that one task.
   - Then its folder leaves per wave worktrees step 4.
   - Then `next-task.mjs --in-flight` refills.
4. **Close the window.**
   - New path in the run's checkout against the baseline, or a cherry-pick conflict → close the window to refills.
   - The turn ends only after every in-flight slot returned or blocked and every slot folder left per wave worktrees step 4.
5. **Repair.**
   - A repair takes a fresh slot worktree at the current `HEAD`.
   - The run's checkout never holds uncommitted work while the window is open.
6. **Stalled slot.**
   - After six `wait-report.mjs` runs with no new report, each waiting slot returns `BLOCKED <n> no report`.
   - Its folder is saved and removed per wave worktrees step 4.
