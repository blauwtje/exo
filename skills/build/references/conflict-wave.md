# Conflict wave

Read it when `land-slot.mjs` prints `Conflict branch:` after `CONFLICT <n>`. The resolver is off unless `EXO_WAVE_RESOLVER=1` or run.json `defaults.waveResolver` is true.

- The conflicted pick is committed on `exo-conflict-<n>` in `.exo/conflict-<n>/tree`; the run checkout stays clean.
- `.exo/conflict-<n>/` holds `ours.diff` (what the run took since the slot's base), `theirs.diff` (the slot's change) and a `brief-task-<k>.md` for this task and each task landed since.
- Dispatch the printed `Prompt:` to `exo:build-task`. It edits only the files named in `Conflict files:` and removes every marker.
- Run the printed `Then:` command. It lands only when no marker is left, the Land gate passes in the tree and the branch squashes onto the run checkout; otherwise it prints `CONFLICT <n>` naming the branch and stops.
- On a stop, report the branch to the user. Do not resolve by hand and do not refill the window.
