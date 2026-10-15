# Settings

## Settings

Run `/exo:configure` to see every setting with its value and layer, or to change one. The first layer that sets a value wins:

1. `.claude/exo.local.json`, this machine only.
2. `.claude/exo.json`, the repository, committed.
3. The plugin options in `/config`.
4. The default.

| Key | Values (default first) | Sets |
|---|---|---|
| `compression` | `short`, `shorter`, `off` | How compact chat replies are. `short` (the default) gives short replies in small, easy words: no preamble, recap or filler, short questions, and every report opens with at most three plain lines with the details in a file. `shorter` gives just the answer and key facts, in easy words. `off` gives normal full replies. A stored `low` still reads as `short` and `high` as `shorter`. A stored `replies` value still reads: `tight` as `short`, `terse` as `shorter`, `standard` as `off`. |
| `specs` | `docs`, `issues`, `both` | Where `spec` stores a brief: `docs/specs/`, a GitHub issue, or both. |
| `ship` | `ask`, `pr-merge`, `open-pr`, `push`, `local` | The finish route `ship` takes without asking. A plan's `Land:` line comes from it: `local` lands `local`, `push` lands `push-main`, `open-pr` and `pr-merge` land `pr`; `ask` makes the spec grill ask, recommending `local`. `pr-merge` opens the pull request in the run and merges it outside the run. |
| `workspace` | `ask`, `branch`, `worktree`, `current` | Where a code-changing run commits. |
| `env` | `ask`, `copy`, `never` | Whether a run copies the local env files of the main checkout into its worktree. `ask` puts the question, `copy` copies them, `never` copies none. |
| `budget` | `off`, `fast`, `balanced`, `quality` | Which model and effort each helper runs on, from one per-kind table. `off` sets none, so every helper inherits your session. `off` is the default. A stored `low`, `medium` or `high` still reads as `fast`, `balanced` or `quality`, and `lean`, `normal` or `full` read the same way. |

Every reply level keeps code, commands, paths, error text, numbers and every not, no, only and except whole. Only chat prose is shortened.

## Always on

A session hook loads these rules at startup, resume, clear and compaction. They hold without calling a skill.

- Searches, builds and reviews run in a helper, a separate Claude context with its own model, so its file dumps never reach your session.
- Before every edit that adds code, Claude checks whether the code is needed and whether something already does it. The rules are in [lean.md](../skills/route-skills/references/lean.md).

## Context limit

A hook reads the context size of each subagent and detached run session on every tool call. Your own session is not limited. Past the soft limit it asks the agent to finish its step and hand off. Past the hard limit it refuses the tool.
How Codex differs is in [codex.md](codex.md).
