<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img src="assets/logo-light.svg" alt="exo" width="280">
  </picture>
</p>

# exo

<p align="center">
  <strong>A plugin for Claude Code and Codex: four stages from idea to merged pull request, and hooks that refuse risky commands.</strong>
</p>

<p align="center">
  <a href="https://github.com/blauwtje/exo/actions/workflows/quality.yml"><img src="https://github.com/blauwtje/exo/actions/workflows/quality.yml/badge.svg" alt="quality"></a>
</p>

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/blauwtje/exo/main/install.sh | bash
```

That asks which harnesses and projects get exo, then installs it. The script keeps its copy in `~/.exo`.

It needs git, Node 22 or newer, and `bash` on `PATH` for the hooks. On Windows, Git Bash runs them; support is best effort.

<details>
<summary>Claude Code plugin</summary>

Inside Claude Code, run these, then restart it:

```text
/plugin marketplace add blauwtje/exo
/plugin install exo@blauwtje
```

To check, run `/exo:configure` in a new session. If it lists exo's settings, exo is loaded.

</details>

<details>
<summary>Codex</summary>

```bash
curl -fsSL https://raw.githubusercontent.com/blauwtje/exo/main/install.sh | bash -s -- --harness codex
```

To check, run `$configure` in a new session. Codex needs a ChatGPT plan that includes Sol: Plus, Pro, Business, Enterprise or Edu. [docs/codex.md](docs/codex.md) lists what differs from Claude Code.

</details>

<details>
<summary>Update or uninstall</summary>

These act on every install the script made.

```bash
curl -fsSL https://raw.githubusercontent.com/blauwtje/exo/main/install.sh | bash -s -- --update
curl -fsSL https://raw.githubusercontent.com/blauwtje/exo/main/install.sh | bash -s -- --remove
```

Installed from inside Claude Code? Update with `claude plugin update exo@blauwtje` in a terminal, then restart. Uninstall with `/plugin uninstall exo@blauwtje`.

</details>

Already have exo? Run the install command again; it updates the copy in `~/.exo`.

## Use

Say what you want and Claude starts the skill that fits, or type `/exo:start <goal>` to have it pick one. A feature runs through four stages, and each one asks which runs next. A bug goes to `find-cause` first.

| Stage | Skill | Does |
|---|---|---|
| 1 | `spec` | Decides what to build. |
| 2 | `build` | Builds a plan or a decided change with subagents. |
| 3 | `verify` | Checks the branch before a pull request. |
| 4 | `ship` | Pushes, opens or merges the pull request. |

Also: `find-cause`, `refactor`, `design-ui`, `check-docs`, `write-docs`, `file-issues`, `edit-skills`, `configure`, `prompt`, `save-session`, `remember`. Six never start from plain words and need their command typed: `edit-skills`, `write-docs`, `file-issues`, `configure`, `check-docs` and `prompt`. `/exo:remember` keeps a correction about the repository only after two sessions have booked it. `exo run <plan>` runs a plan headless from a terminal; `/exo:run-plan setup` installs it. Each skill has a page in [docs/skills/](docs/skills/).

[docs/settings.md](docs/settings.md) covers the settings, including shorter replies and the status line.

## More

- [CONTRIBUTING.md](CONTRIBUTING.md): working on exo.
- [ABOUT.md](ABOUT.md): the words exo uses for its own parts.
- [benchmarks/README.md](benchmarks/README.md): paired runs of exo against a session without it.
- [CHANGELOG.md](CHANGELOG.md): what changed in each release.

[MIT](LICENSE) licensed.
