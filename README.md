<p align="center">
  <img src="assets/social-preview.jpg" alt="exo: Claude Code plugin. Spec, build, verify, ship.">
</p>

# exo

<p align="center">
  <strong>A plugin for Claude Code and Codex: four stages from idea to merged pull request, and hooks that refuse risky commands.</strong>
</p>

<p align="center">
  <a href="https://github.com/blauwtje/exo/actions/workflows/quality.yml"><img src="https://github.com/blauwtje/exo/actions/workflows/quality.yml/badge.svg" alt="quality"></a>
</p>

## Install

Open the block for the harness you use and run its commands.

<details>
<summary>Claude Code (CLI)</summary>

Inside Claude Code, run these two commands, then restart Claude Code:

```text
/plugin marketplace add blauwtje/exo
/plugin install exo@blauwtje
```

Or run this in a terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/blauwtje/exo/main/install.sh | bash -s -- --harness claude
```

To check, run `/exo:configure` in a new session. If it lists exo's settings, exo is loaded.

</details>

<details>
<summary>Codex (CLI)</summary>

```bash
curl -fsSL https://raw.githubusercontent.com/blauwtje/exo/main/install.sh | bash -s -- --harness codex
```

To check, run `$configure` in a new session. If it lists exo's settings, exo is loaded.

Codex needs a ChatGPT plan that includes Sol: Plus, Pro, Business, Enterprise or Edu. The Codex desktop app loads the same skills, but whether it runs exo's hooks and agents is untested. [docs/codex.md](docs/codex.md) lists what differs from Claude Code.

</details>

`curl -fsSL https://raw.githubusercontent.com/blauwtje/exo/main/install.sh | bash` with no arguments asks which harnesses and projects get exo. The script needs git and Node 22 or newer on the machine, and keeps its copy of exo in `~/.exo`.

### Update and uninstall

These commands cover every harness the script installed. To update exo:

```bash
curl -fsSL https://raw.githubusercontent.com/blauwtje/exo/main/install.sh | bash -s -- --update
```

To uninstall exo:

```bash
curl -fsSL https://raw.githubusercontent.com/blauwtje/exo/main/install.sh | bash -s -- --remove
```

`--update` and `--remove` act on every install the script made. `--remove` then deletes `~/.exo` when no install is left and the folder has no local changes. If you installed from inside Claude Code, update with `claude plugin update exo@blauwtje` in a terminal and then restart Claude Code. Uninstall with `/plugin uninstall exo@blauwtje` inside Claude Code.

The hooks need `bash` on `PATH`. On Windows, Git Bash runs them, and support is best effort.

## Use

Say what you want and Claude starts the skill that fits, or type `/exo:start <goal>` to have it pick one. A feature runs `spec` → `build` → `verify` → `ship`, and each stage asks which one runs next. A bug goes to `find-cause` first.

| You want to | Skill |
|---|---|
| Decide what to build | `spec` |
| Build a plan or a decided change | `build` |
| Check a branch before a pull request | `verify` |
| Push, open or merge a pull request | `ship` |
| Fix a bug from its proven cause | `find-cause` |
| Rename, move or split code without changing behavior | `refactor` |
| Design a page or component | `design-ui` |
| Check how a pinned library behaves | `check-docs` |
| Write a README, doc, PR or commit text | `write-docs` |
| File GitHub issues | `file-issues` |
| Write a skill or agent | `edit-skills` |
| See or change a setting | `configure` |

`/exo:save-session` saves where a session is, for a fresh one after `/clear`. `/exo:remember` books a correction about the repository, or approves a claim two sessions have booked. Every skill has a page in [docs/skills/](docs/skills/).

## What changes

| When Claude | exo answers |
|---|---|
| tries to read a 1,812-line file in one go | `exo read guard: src/server.ts has 1812 lines and a read above 400 lines is refused (this one asks the whole file); locate the range first, then read it with offset and a limit of at most 400.` |
| tries `git push --force` | `git-guard: force push discards remote history. Use --force-with-lease, or ask the user to run it.` |
| writes "The hook is not reading the setting, so the reminder never fires." | Under `replies=terse`, that reply reads "Hook not reading setting → reminder never fires." |
| gets a bug report | `find-cause` builds a reproduction that fails on demand and names one cause before anything is fixed. |

These hold in every session without a skill. Searches and reviews run in helpers, so their file dumps stay out of your context. The read guard refuses a file over 400 lines in one go, and six Bash guards stop commands such as a force push. [docs/settings.md](docs/settings.md) lists every guard and all nine settings.

## More

| Page | Covers |
|---|---|
| [CONTRIBUTING.md](CONTRIBUTING.md) | Working on exo: the checks, agents, hooks and releases. |
| [ABOUT.md](ABOUT.md) | The words exo uses for its own parts. |
| [benchmarks/README.md](benchmarks/README.md) | Paired runs that measure exo against a session without it. |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each release. |

[MIT](LICENSE) licensed.
