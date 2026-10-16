# Handing off

- Invoked by another stage or a workflow → ask nothing, return to the caller.
- Otherwise, brief on disk → ask nothing; run `node "${CLAUDE_SKILL_DIR}/../build/scripts/exo-cli.mjs" run <brief path> --detach`, print its one line, then watch the run per `## Watching the run`.
- Setting `env` is `ask` and the main checkout holds gitignored .env files → before the run starts, ask once: copy them into each run worktree, or never. Store the answer with `node "${CLAUDE_SKILL_DIR}/../configure/scripts/settings.mjs" set env <copy or never> --scope project`.
- Brief in an issue, or the command refuses (lock held, error) → ask nothing; print the output of `node "${CLAUDE_SKILL_DIR}/../route-skills/scripts/next-stage.mjs" --after spec --artifact <brief path or #<n>> --fresh`. Build starts in a new session with the brief path as its only input.

## Watching the run

- After `run --detach` → end the turn at once; the lead wakes only on park or finish, never to poll.
- Session with the exo status line → the status line shows progress and a wake prompt arrives when the run stops.
- Wake names `landed` or `passed` → report the result from the run report.
- Wake names another phase → read `<run directory>/report.md`; one worktree agent saves the blocked task's partial work to `.exo/carry/task<n>-partial.patch`, resets the run tree, fixes the plan (`node "${CLAUDE_SKILL_DIR}/scripts/plan-check.mjs" --loop --run --plan <plan> --root <run worktree>`) or the cause.
- Then → `node "${CLAUDE_SKILL_DIR}/../build/scripts/exo-cli.mjs" run --resume <id> --detach`, end the turn.
- A task stops after two repairs → PushNotification tool if present, then ask the user. Repairs of a task = its `task<n>-partial.patch` files plus your repair turns.
- Session without the status line → run the watch command the start line prints as one background Bash call.
- While the watch runs → say nothing more.
- Run directory → the directory of the `report` path the watch prints, else `.exo/run/<id>/`.
- Watch ends with a `report` path → read `<run directory>/report.md`; report unprompted the `Phase:`, the `Landed:` range, the `Pushed:` target, the user's next action, and the `<run directory>/report.md` path for the rest.
- Next action, first match wins:
  - Run changed a loaded plugin's source and landed → `/reload-plugins`.
  - `parked` → `exo approve <id>` after the open gates listed in `<run directory>/report.md`.
  - `stopped`, `refused` or `crashed` → the reason: `Reason:` in `<run directory>/report.md`, else the last error in `<run directory>/run.log`.
  - Refused run → report its `Reason:`, fix the plan or cause in a worktree, rerun `exo-cli.mjs run <plan> --detach`; never build in the session.
  - Watch says `process gone` → `exo run --resume <id>`.
- Watch exits 124 → report the run still running and the keep-waiting command it prints.
