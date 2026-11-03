# Watching the run

This page keeps the session free while the user's terminal run works, then reports the result.

- After `run --detach`, end the turn at once; this session wakes on park or finish, never polls.
- While waiting, start no other session, loop or watcher, and call no ScheduleWakeup, Monitor or sleep; the run-watch hook wakes this session.
- With the exo status line, it shows progress and a wake prompt arrives at the stop.
- On a wake naming `landed` or `passed`, report from the run report.
- On a wake naming another phase, read `<run directory>/report.md`, then dispatch one worktree agent (own git worktree) to repair. This session edits no file itself, even for a one-line plan fix, so its context stays free for the next wake.
- The repair brief holds the report path and, when the run had edits, the leftover patch and the reset run tree, which the agent applies or discards.
  - The `leftover saved to` or `partial work saved to` line in `<run directory>/run.log` names them.
- The agent fixes the plan or the cause, and checks a plan fix with `node "${CLAUDE_SKILL_DIR}/../spec/scripts/plan-check.mjs" --loop --run --plan <plan> --root <run worktree>`.
- The repair lands where `run --resume` reads.
  - Commit a plan fix in the checkout that holds the plan file at `plan` in `<run directory>/state.json`; resume refuses uncommitted edits there.
  - Commit a cause fix on the run branch (`Branch:` in the report); a commit on the agent's own branch is not read.
- When the agent returns, tell the user to run `exo run --resume <id> --detach` in a terminal, and end the turn.
- When a task stops after two repairs, send a PushNotification if available, then ask the user.
  - A task's repairs are its earlier `task <n> blocked:` stop lines in `<run directory>/run.log`, which every resume appends to.
  - The colon follows `blocked` directly; `task <n> blocked, repair session` lines do not count.
- Without the status line, run the watch command the start line prints as one background Bash call, saying nothing more meanwhile.
- The run directory holds the `report` path the watch prints, else `.exo/run/<id>/`.
- When the watch ends with a `report` path, read `<run directory>/report.md` and report unprompted the `Phase:`, the `Landed:` range, the `Pushed:` target, the user's next action and the report path.
- When the watch exits 124, report the run still running, with the keep-waiting command it prints.

The user's next action is the first match:

1. The run changed a loaded plugin's source and landed: `/reload-plugins`.
2. The run is `parked`: `exo approve <id>`, after the open gates listed in `<run directory>/report.md`.
3. The run is `stopped`, `refused` or `crashed`: name the `Reason:` in `<run directory>/report.md`, else the last error in `<run directory>/run.log`.
4. The run is refused: fix the plan or cause in a worktree, and tell the user to rerun `exo run <plan> --detach` in a terminal.
5. The watch says `process gone`: `exo run --resume <id>`.
