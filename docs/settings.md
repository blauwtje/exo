# Settings

## Settings

Run `/exo:configure` to see every setting with its value and layer, or to change one. The first layer that sets a value wins:

1. `.claude/exo.local.json`, this machine only.
2. `.claude/exo.json`, the repository, committed.
3. The plugin options in `/config`.
4. The default.

| Key | Values (default first) | Sets |
|---|---|---|
| `specs` | `docs`, `issues`, `both` | Where `spec` stores a brief: `docs/specs/`, a GitHub issue, or both. |
| `ship` | `ask`, `pr-merge`, `open-pr`, `push`, `local` | The finish route `ship` takes without asking. A plan's `Land:` line comes from it: `local` lands `local`, `push` lands `push-main`, `open-pr` and `pr-merge` land `pr`; `ask` makes the spec grill ask, recommending `local`. `pr-merge` opens the pull request in the run and merges it outside the run. |
| `workspace` | `ask`, `branch`, `worktree`, `current` | Where a code-changing run commits. |
| `env` | `ask`, `copy`, `never` | Whether a run copies the local env files of the main checkout into its worktree. `ask` puts the question, `copy` copies them, `never` copies none. |
| `budget` | `on`, `off` | Which model and effort each helper runs on, from one per-kind table. `on` is the default. `off` sets none, so every helper inherits your session. A `general-purpose` or `claude` helper with no model or effort set also gets one under `on`, chosen from an `exo-kind:` line at the start of its brief or from job words in its description such as review, design or fix; with neither it is denied and the reason names `exo-kind:`. A build-task or doc-task retried after a failed check runs one level up, because `land-task` ends each refusal with an `exo-retry` line and the hook reads that line. Every old value (`low`, `lean`, `fast`, `medium`, `normal`, `balanced`, `high`, `full`, `quality`) reads as `on`. |
| `receipts` | `on`, `off` | Whether exo shows you a one-line receipt when a session starts (`exo is on`), when a skill starts, when a helper is dispatched and when a command is refused. The lines go to you only and cost the model no tokens. `off` shows none; a Node version warning still shows. |
| `memory` | `on`, `off` | Whether exo keeps a project memory. `on` is the default: a session start points at the memory file, and `/exo:remember`, review lessons and spec decisions write to it. `off` writes nothing and reads nothing; the memory file is never deleted, and the settings line shows `memory=off`. |

Short replies come from `/output-style exo:adhd`, which keeps code, commands, paths, error text, numbers and every not, no, only and except whole. Only chat prose is shortened.

## Always on

A session hook loads these rules at startup, resume, clear and compaction. They hold without calling a skill.

- Searches, builds and reviews run in a helper, a separate Claude context with its own model, so its file dumps never reach your session.
- Before every edit that adds code, Claude checks whether the code is needed and whether something already does it. The rules are in [lean.md](../skills/route-skills/references/lean.md).

## Context limit

A hook reads the context size of each session on every tool call. Past the soft limit it asks the agent to finish its step and hand off. Past the hard limit it refuses the tool of a subagent or detached run session. Your own session is never refused: it gets one note at the soft limit and one at the hard limit, telling it to send the rest of the work to subagents and stay in the session.
## Status line

Claude Code only. `/exo:configure` runs `node skills/configure/scripts/settings.mjs statusline`: it writes a launcher to `~/.claude/exo/statusline.mjs` (under `CLAUDE_CONFIG_DIR` when set) and prints a `statusLine` block for your `settings.json`, which exo never edits. The status line has two lines. Line 1 is where and who: a bold `exo` mark, the git branch (cut to 20 characters), the model with its effort, and `build 2/5` while this session runs `exo:build` (the task in progress of the plan total; it drops when the build ends or goes stale). Line 2 is what is left: `ctx 120k/200k`, the tokens against exo's context budget (the smaller of exo's limit and the window), then `5h 42%`, `7d 63%` only from 50% used, and `5h out in 1h 5m`, a warning in orange that shows only when, after at least 30 minutes of the window, your pace would use up the 5h limit before it resets. A part with no data drops. `NO_COLOR` turns the colors off. To remove it, delete the `statusLine` key.

How Codex differs is in [codex.md](codex.md).
