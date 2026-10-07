# Settings and guards

## Settings

Run `/exo:configure` to see every setting with its value and layer, or to change one. The first layer that sets a value wins:

1. `.claude/exo.local.json`, this machine only.
2. `.claude/exo.json`, the repository, committed.
3. The plugin options in `/config`.
4. The default.

| Key | Values (default first) | Sets |
|---|---|---|
| `replies` | `tight`, `terse`, `standard` | How dense chat replies are. `tight` drops preamble, recap and filler. `terse` also drops a, an, the, is, are, was and were. `standard` is full prose. |
| `specs` | `docs`, `issues`, `both` | Where `spec` stores a brief: `docs/specs/`, a GitHub issue, or both. |
| `ship` | `ask`, `pr-merge`, `open-pr`, `push`, `local` | The finish route `ship` takes without asking. |
| `workspace` | `ask`, `branch`, `worktree`, `current` | Where a code-changing run commits. |
| `guards` | `on`, `off` | Whether the guards refuse anything. There is no switch per guard. |
| `guard_lines` | `400` or any line count | Where the read guard starts. |
| `heavy_commands` | empty, or prefixes joined by `;` | A matching command runs once per code state across sessions. A green result holds 24 hours. |
| `heavy_after_seconds` | `60`, or `0` for off | A test-like command slower than this gets the same treatment. |
| `budget` | `medium`, `high`, `low` | Which model each helper runs on. |
| `log_scan` | `off`, `on` | `on`: a Bash command that names, or a Read that opens, a long log file gets a note of at most 5 lines with its error and warning counts and most common messages. |
| `sibling_scan` | `off`, `on` | `on`: an edit that removes lines gets a note of at most 5 lines naming other files and bindings that may share the fault. |

Every reply level keeps code, commands, paths, error text, numbers and every not, no, only and except whole. Only chat prose is shortened.

The opt-in `exo:scannable` output style sets the layout instead: the answer first, at most three labelled blocks, one closing next action. Pick it in `/output-style`.

## Always on

A session hook loads these rules at startup, resume, clear and compaction. They hold without calling a skill.

- Searches, builds and reviews run in a helper, a separate Claude context with its own model, so its file dumps never reach your session.
- Before every edit that adds code, Claude checks whether the code is needed and whether something already does it. The rules are in [lean.md](../skills/route-skills/references/lean.md).
- The read guard refuses a `Read` of a file over `guard_lines` lines in one go, and a second read of lines unchanged since the last one. Reads through Bash, such as `cat`, are not covered.
- The repeat guard refuses the third identical `Bash` command or `Edit` in one context window.

## Bash guards

A hook stops six kinds of command and says what to do instead.

| Guard | Acts on |
|---|---|
| Output | A known-verbose build, test or log command, which runs through `tail -n 200`, and a whole-file shell read over the byte cap. |
| Detach | A process started with `&`, `nohup`, `disown` or `setsid`. |
| Destructive | A command that deletes a container, volume, database or credential. |
| Git | A force push, `reset --hard`, `clean -f`, a stash drop, a force-delete of an unlanded branch, a whole-tree checkout or restore. |
| Secrets | A shell read of a path your `Read(...)` deny entries protect. |
| Writing | AI attribution in a commit, pull request or branch name, and a commit subject that is not a Conventional Commit. |

The guard internals are in [CONTRIBUTING.md](../CONTRIBUTING.md#guard-internals). Codex drops some of these; see [codex.md](codex.md).
