# Handing off

- Invoked by another stage or a workflow → ask nothing, return to the caller.
- Otherwise, brief on disk → ask nothing; run `node "${CLAUDE_SKILL_DIR}/../build/scripts/exo-cli.mjs" run <brief path> --detach`, print its one line, then watch the run per `## Watching the run`.
- Brief in an issue, or the command refuses (lock held, error) → ask nothing; print the output of `node "${CLAUDE_SKILL_DIR}/../route-skills/scripts/next-stage.mjs" --after spec --artifact <brief path or #<n>> --fresh`. Build starts in a new session with the brief path as its only input.

## Watching the run

- Session with the exo status line → end the turn; the status line shows progress and a wake prompt arrives when the run stops.
- Wake names `landed` or `passed` → report the result from the run report.
- Wake names another phase → read `<run directory>/report.md`; one worktree agent saves the blocked task's partial work to `.exo/carry/task<n>-partial.patch`, resets the run tree, fixes the plan (`node "${CLAUDE_SKILL_DIR}/scripts/plan-check.mjs" --loop --plan <plan> --root <run worktree>`) or the cause.
- Then → `node "${CLAUDE_SKILL_DIR}/../build/scripts/exo-cli.mjs" run --resume <id> --detach`, end the turn.
- A task stops after two repairs → PushNotification tool if present, then ask the user. Repairs of a task = its `task<n>-partial.patch` files plus your repair turns.
- Session without the status line → wait with this loop as one background Bash call, or the Monitor tool on the same check; never a foreground `sleep`. `<id>` comes from the printed line.

  ```bash
  r=$(git rev-parse --show-toplevel); n=0
  until [ -f "$r/.exo/kept/<id>/state.json" ] || node "${CLAUDE_SKILL_DIR}/../build/scripts/exo-cli.mjs" status <id> | grep -Eq '  (passed|landed|parked|stopped|refused|crashed)  |process gone'; do
    n=$((n+1)); [ "$n" -ge 180 ] && { echo "exo: run <id> still running after 2 h" >&2; exit 1; }
    sleep 40
  done
  ```

- `.exo/kept/<id>/state.json` check stays: a `landed`, `passed` or `refused` run moves to `.exo/kept/<id>/`, where `exo status <id>` finds no run.
- While the loop runs → say nothing more.
- Run directory → `.exo/kept/<id>/` if it exists, else `.exo/run/<id>/`.
- Loop ends → read `<run directory>/report.md`; report unprompted the `Phase:`, the `Landed:` range, the `Pushed:` target, the user's next action, and the `<run directory>/report.md` path for the rest.
- Next action, first match wins:
  - Run changed a loaded plugin's source and landed → `/reload-plugins`.
  - `parked` → `exo approve <id>` after the open gates listed in `<run directory>/report.md`.
  - `stopped`, `refused` or `crashed` → the reason: refused commands in `<run directory>/report.md`, else the last error in `<run directory>/run.log`.
  - Status says `process gone` → `exo run --resume <id>`.
- Loop exits 1 → report the run still running and `exo status <id>`.
