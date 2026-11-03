# Rolling window

`task-runner` starts the next ready task as soon as one lands, not after a whole wave. Each slot is one task in its own worktree, per wave worktrees steps 1, 3 and 4.

1. **Baseline.** `next-task.mjs --open-slots` runs steps 1 and 2, and you run them by hand only after `Wave discarded:`. Before the first slot, write the run checkout's `git status --porcelain` once to `<root>/.exo/baseline.txt`.
2. **Open a slot.**
   - Record the slot's own `<base>`.
   - Create its worktree per wave worktrees step 1.
   - When `git worktree add` or setup fails, close the window to refills. The task then builds alone in the run's checkout.
3. **Land.**
   - For a green slot run `node "<skill>/scripts/land-slot.mjs" --plan <plan> --task <n> --root <root> --slot "<root>-task-<n>" --base <base> --baseline <root>/.exo/baseline.txt --in-flight <other running task numbers, comma separated>`.
   - It runs wave worktrees steps 3 and 4 for that slot; read its first output word.
   - `LANDED` means the slot is gone. Read the refill line of the report after it: `Start:` while another slot runs, else `Next:` or `Wave:`.
   - `REFUSED` routes as a failed build. `CONFLICT` and `NEWPATH` close the window to refills (step 4), and each keeps and names the slot folder.
4. **Close the window.**
   - A new path in the run's checkout against the baseline, or a cherry-pick conflict, closes the window to refills.
   - `task-runner` returns only after every in-flight slot returned or blocked. Every slot folder must also have left per wave worktrees step 4, or be kept per step 6 and named in the return.
5. **Repair.**
   - A repair takes a fresh slot worktree at the current `HEAD`, and the run's checkout holds no uncommitted work while the window is open.
6. **Missing report.**
   - Resume a returned build with no report once, via SendMessage, to write it.
   - If there is still no report, the child is dead. Leave its slot folder in place, since `remove-worktree.mjs --report` refuses without the report, and name the folder and that refusal in the return.
7. **Dispatch.**
   - At most four slots build at once (`WAVE_LIMIT`).
   - Send each window build, including a `Next:` build, to `exo:build-task` in the foreground, because a background dispatch ends the turn before the report lands.
   - A landing's refill is in `land-slot.mjs`'s output, with slots opened. Otherwise run `next-task.mjs --in-flight <running task numbers, comma separated>` and read its `Start: Task <n>[, Task <m>]` line.
   - On `Start: none` start no refill, land the returned slots, then return to step 1.
8. **Wait.**
   - Send every `Prompt:` of a block as a foreground call in one message; each returns after its build's report.
   - Land each returned slot per step 3 at once, unless `Land all:` follows. Then land only once every build of the block returned.
   - Keep the turn open while a build, repair or land runs, use no shell loop or `sleep`, and land every returned report before the next dispatch.
