# Settings

## Settings

Run `/exo:configure` to see every setting with its value and layer, or to change one. The first layer that sets a value wins:

1. `.claude/exo.local.json`, this machine only.
2. `.claude/exo.json`, the repository, committed.
3. The plugin options in `/config`.
4. The default.

| Key | Values (default first) | Sets |
|---|---|---|
| `compression` | `off`, `short`, `shorter` | How compact chat replies are. `off` (the default) gives normal full replies and adds no reply rules to the session. `short` opens every report with at most three plain lines, with the details in a file, and asks short questions one at a time. `shorter` adds short replies in small, easy words: just the answer and key facts, no preamble, recap or filler. The `exo:short` output style (`/output-style`) carries the `short` text without this setting; pick one of the two, not both. A stored `low` still reads as `short` and `high` as `shorter`. A stored `replies` value still reads: `tight` as `short`, `terse` as `shorter`, `standard` as `off`. |
| `specs` | `docs`, `issues`, `both` | Where `spec` stores a brief: `docs/specs/`, a GitHub issue, or both. |
| `ship` | `ask`, `pr-merge`, `open-pr`, `push`, `local` | The finish route `ship` takes without asking. A plan's `Land:` line comes from it: `local` lands `local`, `push` lands `push-main`, `open-pr` and `pr-merge` land `pr`; `ask` makes the spec grill ask, recommending `local`. `pr-merge` opens the pull request in the run and merges it outside the run. |
| `workspace` | `ask`, `branch`, `worktree`, `current` | Where a code-changing run commits. |
| `env` | `ask`, `copy`, `never` | Whether a run copies the local env files of the main checkout into its worktree. `ask` puts the question, `copy` copies them, `never` copies none. |
| `budget` | `off`, `fast`, `balanced`, `quality` | Which model and effort each helper runs on, from one per-kind table. `off` sets none, so every helper inherits your session. `balanced` is the default. A `general-purpose` or `claude` helper with no model or effort set also gets one. A stored `low`, `medium` or `high` still reads as `fast`, `balanced` or `quality`, and `lean`, `normal` or `full` read the same way. |
| `receipts` | `on`, `off` | Whether exo shows you a one-line receipt when a session starts (`exo is on`), when a skill starts, when a helper is dispatched and when a command is refused. The lines go to you only and cost the model no tokens. `off` shows none; a Node version warning still shows. |

Every reply level keeps code, commands, paths, error text, numbers and every not, no, only and except whole. Only chat prose is shortened.

## Always on

A session hook loads these rules at startup, resume, clear and compaction. They hold without calling a skill.

- Searches, builds and reviews run in a helper, a separate Claude context with its own model, so its file dumps never reach your session.
- Before every edit that adds code, Claude checks whether the code is needed and whether something already does it. The rules are in [lean.md](../skills/route-skills/references/lean.md).

## Context limit

A hook reads the context size of each session on every tool call. Past the soft limit it asks the agent to finish its step and hand off. Past the hard limit it refuses the tool of a subagent or detached run session. Your own session is never refused: it gets one note at the soft limit and one at the hard limit, asking it to run `exo:save-session` and continue in a fresh session.
## Status line

Claude Code only. `/exo:configure` runs `node skills/configure/scripts/settings.mjs statusline`: it writes a launcher to `~/.claude/exo/statusline.mjs` (under `CLAUDE_CONFIG_DIR` when set) and prints a `statusLine` block for your `settings.json`, which exo never edits. The line shows a bold `exo` mark, tokens and share of the window colored by the context budget (green below the soft limit, yellow up to the limit, red past it), the 5h and 7d limits, and the model with its effort. `NO_COLOR` turns the colors off. To remove it, delete the `statusLine` key.

How Codex differs is in [codex.md](codex.md).
