# run-plan

Hands a plan's unlanded tasks to `build`, installs the terminal `exo run`, or adds a GitHub Actions workflow that runs a plan from an issue.

## When it runs

Only when you type `/exo:run-plan <plan>`, `/exo:run-plan setup` or `/exo:run-plan ci`.

Not for the headless loop: that runs only from your terminal as `exo run <plan>`.

## What you get

- `exo:build <plan>` runs the plan in this session, each task landed by agents.
- `setup` installs `exo run` for your terminal, where each task runs in its own headless process.
- One closing line pointing to `exo run <plan> --detach`.
- `ci` writes `.github/workflows/exo-run.yml` into your repository from `skills/run-plan/assets/exo-run.yml`, pinned to this exo version. A second run leaves a file you edited alone and says so; `--force` replaces it, and `--label <name>` changes the trigger label from `exo`.

## Run from GitHub Actions

After `ci`, add the repository secret `ANTHROPIC_API_KEY` and allow Actions to create pull requests (Settings, Actions, General). Then either of these starts a run:

- A comment `/exo run docs/plans/x.md` on an issue, on a line of its own.
- The label `exo` on an issue whose body has that line.

The agent job runs `exo run` on the default branch with a read-only token (`contents: read`). It hands its branch to a second job as a git bundle artifact. Only that second job holds `contents: write` and `pull-requests: write`; it pushes `exo/issue-<number>-<run id>` and opens the pull request.

- Only authors with the association OWNER, MEMBER or COLLABORATOR start a run, and a comment on a pull request starts nothing, so a fork's code never meets the secret.
- The comment text reaches the job only through an environment variable and a strict path pattern (`docs/plans/` or `docs/specs/`, one file name of letters, digits, `.`, `_`, `-`, ending `.md`).
- Claude only. One live tracking comment with the task checklist is not built.
- A push made with the workflow token starts no other workflow, so the pull request's own checks need a manual rerun or a token of your own.

## Run state

`exo run` keeps one record per run in `.exo/run/<id>/`. `state.json` is the status: phase, task, landed count, and `step`, the latest journal step. `journal.jsonl` is the step journal that `run-plan` appends to: `task-start`, `session` (the builder finished, with its last result line), `check` (the land script's result), `attempt` (a failed try, with its fingerprints, retry note and session id) and `commit`. `ops.jsonl` is the place of the operation record a run-level undo writes; `state.json` names it in `ops`.

`exo run --resume <id>` reads the journal. A task whose builder session finished but whose land did not complete is landed from that session's result instead of spawning the builder again, and the failed attempts, retry note and session id of the task in flight come back. A timed out session, or a plan edited since, is not replayed. `exo status` and the start board read `state.json`, so they need no second file.

## Undo a run

`exo undo <id>` lists what it would reverse and changes nothing. `exo undo <id> --apply` does it. `exo run` appends every ref move (branch created, commit, squash, fast-forward of the base, branch deleted, checkout switch), worktree and push to `.exo/run/<id>/ops.jsonl`, and undo walks that file from the last entry to the first.

- It never deletes work. Before a ref moves or goes away, undo saves it as `refs/exo/undo/<id>/<ref>`, so `git update-ref <ref> <backup>` restores it.
- It acts on a ref only while the ref still sits at the sha the run left it on. Otherwise it refuses, names the sha it found, skips the later steps and exits with 3.
- A branch checked out in a worktree moves only when that worktree has no changes, untracked files included.
- Worktrees and pushes are reported, never removed or reverted. Undo does not force push.
- It works on a kept run (`.exo/kept/<id>/`) too, and a second `--apply` changes nothing. Inside Claude Code only the dry run is allowed.

## Stops

Every stop of `exo run` goes through `stopRun` in `run-plan-stops.mjs`, which writes `stop` into `state.json` (`kind`, `reason`, `task`, `resumable`), prints one `run stopped` line and sets the exit code: 3 for `autonomy` and `parked`, 4 for `ceiling`, 1 for the rest, 0 for `done`. A resume reads the same record whatever the kind.

## Pausing a headless run

`exo run` reads an optional `Autonomy:` line in the plan's `## Plan basis`:

- `auto` (the default, and what an absent line means) never pauses.
- `pause-flagged` stops before every task whose field line holds `Pause: yes`.
- `approve-each` stops before every task.

A stop parks the run (exit 3) with an open gate from source `autonomy`. `exo approve` approves the gate and continues from that task, and the approved task does not pause again, not even on a retry or a later `exo run`. `exo run` without a run record refuses a plan with an unlanded pause. `plan-check` accepts the three modes and `Pause: yes` only.

## Other providers

`exo run` can use DeepSeek or Z.ai instead of Claude. Two terminal subcommands set that up:

- `exo key set <provider>` stores the provider's key in `~/.config/exo/keys.env`. It asks for the key without echoing it, or reads one line from stdin when piped, and never prints it.
- `exo claude --provider <name> [--effort <level>] [-- <claude args>]` starts an interactive Claude Code session on that provider. A missing key stops it with the line `exo key set <name>`.

## Spend ceiling

`exo run <plan> --max-run-usd <x>` stops the run after the task that brings the total cost to `<x>`. The task that crosses the ceiling lands, the rest wait, and the run ends with exit status 4, so `exo run <plan>` again continues after you raise the ceiling.

- At 80% of the ceiling the run prints one `budget:` line.
- The closing lines include a `receipt` line per task and per session kind. A session whose stream reported no cost shows as unknown, never as zero.
- `defaults.maxRunUsd` in `~/.config/exo/run.json` sets the ceiling for every run; the flag wins.

## Source

`skills/run-plan/SKILL.md`, which invokes `build`; `skills/run-plan/scripts/ci-*.mjs` and `skills/run-plan/assets/exo-run.yml` for the workflow.
