<p align="center">
  <img src="assets/social-preview.jpg" alt="exo: plugin for AI coding agents. Decide, build, review.">
</p>

# exo

[![quality](https://github.com/blauwtje/exo/actions/workflows/quality.yml/badge.svg)](https://github.com/blauwtje/exo/actions/workflows/quality.yml)

exo is a Claude Code plugin that gives Claude one way of working: decide what to build, build it, then review it, each as its own step. It is built for the ways a long session goes wrong: code nobody asked for, whole files read to find one function, and a context so full that earlier decisions drop out of it.

## Install

```text
/plugin marketplace add blauwtje/exo
/plugin install exo@blauwtje
```

Restart Claude Code, then run `/exo:configure` in a new session: a list of exo settings means it loaded. exo needs `bash` and `node` on `PATH`. On Windows, see [Requirements](#requirements).

## What you get

Say what you want and Claude starts the skill that fits. Or type `/exo:start <goal>` and it picks one.

| You want to | Skill | What it does |
|---|---|---|
| Decide what to build | `spec` | Settles what "done" means: the result, the data, the architecture. |
| Build it | `build` | Runs a plan with helpers and review, or builds a decided change test-first. |
| Restructure code | `refactor` | Renames, moves or splits code without changing behavior. |
| Fix a bug | `find-cause` | Finds the real cause before anything is fixed. |
| Check a branch before a PR | `verify` | Runs the checks and the branch review, then repairs what they find. |
| Ship | `ship` | Pushes, opens or merges a pull request, and fixes its checks or comments. |
| Design a screen | `design-ui` | Designs or improves how a page or component looks. |
| Know how a library behaves | `check-docs` | Checks a pinned library, API or service against its docs. |
| Write docs | `write-docs` | Writes a README, doc page, pull request or commit text. |
| File issues | `file-issues` | Turns work into GitHub issues. |
| Write a skill | `edit-skills` | Writes or improves a skill or agent. |
| Change a setting | `configure` | Shows or changes an exo setting. |

These run only when you type them:

| Command | What it does |
|---|---|
| `/exo:start [goal]` | Lists the skills in plain words, or picks one for a goal. |
| `/exo:save-session` | Saves where a session is, for a fresh one after `/clear`. |
| `/exo:remember` | Books a correction about this repository, or approves a claim two sessions have booked. |

Each skill has a page for people under [docs/skills/](docs/skills/).

## How to use it

A feature whose details are still open runs through four stages:

1. "I want something for X but I'm not sure what exactly." `spec` settles the open decisions and writes a brief.
2. "Run the plan at docs/..." `build` builds it. After a `/clear`, "carry on" resumes it.
3. "Verify the branch for the plan at docs/..." `verify` runs the checks and the branch review.
4. "Push this" or "merge the PR." `ship` pushes, opens or merges the pull request.

Each stage ends by asking which stage runs next and on which model. A reported failure goes to `find-cause` first, so nothing is fixed before its cause is shown.

## What runs in the background

A session hook loads these rules at startup, resume, clear and compaction, so they hold without calling a skill.

- **Helpers.** Searches, builds and reviews run in a helper, a separate Claude context with its own model, so its file dumps never reach your session.
- **The ladder.** Before every edit that adds code, Claude checks whether the code is needed and whether something already does it. The rungs are in [ladder.md](skills/route-skills/references/ladder.md).
- **The read guard.** A hook refuses a `Read` of a file over 400 lines in one go, and a second read of lines unchanged since the last one. Reads through Bash, such as `cat`, are not covered.
- **The Bash guards.** A hook stops the commands below and says what to do instead.

| Guard | Acts on |
|---|---|
| Output | A known-verbose build, test or log command, which runs through `tail -n 200`, and a whole-file shell read over the byte cap. |
| Detach | A process started with `&`, `nohup`, `disown` or `setsid`. |
| Destructive | A command that deletes a container, volume, database or credential. |
| Git | A force push, `reset --hard`, `clean -f`, a stash drop, a force-delete of an unlanded branch, a whole-tree checkout or restore. |
| Secrets | A shell read of a path your `Read(...)` deny entries protect. |
| Writing | AI attribution in a commit, pull request or branch name, and a commit subject that is not a Conventional Commit. |

## Settings

`/exo:configure` shows every setting with its value and layer, and changes one. The first layer that sets a value wins: `.claude/exo.local.json` (this machine), `.claude/exo.json` (the repository, committed), the plugin options in `/config`, then the default.

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

Every reply level keeps code, commands, paths, error text, numbers and every not, no, only and except whole, and only chat prose is shortened. The opt-in `exo:scannable` output style sets the layout instead: the answer first, at most three labelled blocks, one closing next action. Pick it in `/output-style`.

## Requirements

- `bash` and `node` on `PATH`, for the hooks.
- On Windows, Git for Windows, whose Git Bash runs the hooks. Windows support is best effort: the checks run on Linux only, and Windows bugs are fixed as they are reported.

## More

- [CONTRIBUTING.md](CONTRIBUTING.md): setting up a clone, the checks, the agents and their models, the hooks, the guard internals and releases.
- [ABOUT.md](ABOUT.md): the words exo uses for its own parts.
- [benchmarks/README.md](benchmarks/README.md): paired runs that measure exo against a session without it.
- [CHANGELOG.md](CHANGELOG.md): what changed in each release.

To work on exo itself, run `npm install`, then `npm run check` before every commit, and `claude --plugin-dir .` to run the working tree instead of the installed copy.

## License

[MIT](LICENSE): use it, change it and share it for any purpose, commercial included.
