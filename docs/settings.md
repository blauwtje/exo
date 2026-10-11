# Settings and guards

## Settings

Run `/exo:configure` to see every setting with its value and layer, or to change one. The first layer that sets a value wins:

1. `.claude/exo.local.json`, this machine only.
2. `.claude/exo.json`, the repository, committed.
3. The plugin options in `/config`.
4. The default.

| Key | Values (default first) | Sets |
|---|---|---|
| `compression` | `low`, `off` | How compact chat replies are. `low` writes short plain text: no preamble, recap or filler, short questions, and every report opens with at most three plain lines with the details in a file. `off` is full prose. A stored `high` still reads as `low`, and a stored `replies` value still reads: `tight` and `terse` as `low`, `standard` as `off`. |
| `specs` | `docs`, `issues`, `both` | Where `spec` stores a brief: `docs/specs/`, a GitHub issue, or both. |
| `ship` | `ask`, `pr-merge`, `open-pr`, `push`, `local` | The finish route `ship` takes without asking. A plan's `Land:` line comes from it: `local` lands `local`, `push` lands `push-main`, `open-pr` and `pr-merge` land `pr`; `ask` makes the spec grill ask, recommending `local`. `pr-merge` opens the pull request in the run and merges it outside the run. |
| `workspace` | `ask`, `branch`, `worktree`, `current` | Where a code-changing run commits. |
| `guards` | `on`, `off` | Whether the guards refuse anything. There is no switch per guard. |
| `budget` | `medium`, `high`, `low` | Which model each helper runs on. |

Every reply level keeps code, commands, paths, error text, numbers and every not, no, only and except whole. Only chat prose is shortened.

## Always on

A session hook loads these rules at startup, resume, clear and compaction. They hold without calling a skill.

- Searches, builds and reviews run in a helper, a separate Claude context with its own model, so its file dumps never reach your session.
- Before every edit that adds code, Claude checks whether the code is needed and whether something already does it. The rules are in [lean.md](../skills/route-skills/references/lean.md).

## Bash guards

A hook stops three kinds of command and says what to do instead.

| Guard | Acts on |
|---|---|
| Destructive | A command that deletes a container, volume, database or credential. |
| Git | A force push, `reset --hard`, `clean -f`, a stash drop, a force-delete of an unlanded branch, a whole-tree checkout or restore. |
| Secrets | A shell read of a path your `Read(...)` deny entries protect. |

A second hook reads each session's and agent's context size on every tool call: past the soft limit (60k tokens for the lead and for an agent) it asks it to finish its step and hand off, with the lead delegating further work to fresh subagents; past the hard limit (100k) it refuses the tool, and the lead hands all remaining work to one fresh subagent.
How Codex differs is in [codex.md](codex.md).
