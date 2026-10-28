# Rolling window

`run-unit` starts the next ready task as soon as one lands, instead of waiting for a whole wave. Each slot is one task in its own worktree, per wave worktrees step 1, 3, 4.

1. **Baseline.** `next-task.mjs --open-slots` runs steps 1 and 2; by hand only after `Wave discarded:`. Before the first slot, write the run checkout's `git status --porcelain` once to `<root>/.exo/baseline.txt`.
2. **Open a slot.**
   - Record the slot's own `<base>`.
   - Create its worktree per wave worktrees step 1.
   - Failed `git worktree add` or setup → close the window to refills; the current task builds alone in the run's checkout.
3. **Land.**
   - Green slot → `node "<skill>/scripts/land-slot.mjs" --plan <plan> --task <n> --root <root> --slot "<root>-task-<n>" --base <base> --baseline <root>/.exo/baseline.txt --in-flight <other running task numbers, comma separated>`.
   - One call runs wave worktrees step 3 and 4 for that slot; read the first word of its output.
   - `LANDED` → the slot is gone; read the refill line of the report after it: `Start:` with another slot running, else `Next:` or `Wave:`.
   - `REFUSED` → route as a failed build; `CONFLICT` or `NEWPATH` → close the window to refills (step 4); each keeps the slot folder and names it.
4. **Close the window.**
   - New path in the run's checkout against the baseline, or a cherry-pick conflict → close the window to refills.
   - `run-unit` returns only after every in-flight slot returned or blocked and every slot folder left per wave worktrees step 4, or kept per step 6 and named in the return.
5. **Repair.**
   - A repair takes a fresh slot worktree at the current `HEAD`.
   - The run's checkout never holds uncommitted work while the window is open.
6. **Missing report.**
   - A returned build with no report is resumed once with SendMessage to write it. Still no report → a dead child: each such slot folder stays in place, not removed, since `remove-worktree.mjs --report` refuses while the report is absent; the return names the folder and that refusal.
7. **Dispatch.**
   - At most four slots build at once (`WAVE_LIMIT`).
   - Each window build goes to `exo:build-task` in the foreground, never `run_in_background`; a `Next:` build too.
   - A landing's refill is in `land-slot.mjs`'s output, slots opened; else run `next-task.mjs --in-flight <running task numbers, comma separated>`; read its `Start: Task <n>[, Task <m>]` line.
   - `Start: none` → no refill; land the returned slots, then step 1.
8. **Wait.**
   - Every `Prompt:` of a block goes as a foreground call in the one message; it returns after each build's report.
   - Land each returned slot per step 3 at once, unless `Land all:` follows: then land only once every build of the block returned.
   - Never end the turn while a build, repair or land runs, no shell loop or `sleep`: every returned report lands before the next dispatch.
