<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img src="assets/logo-light.svg" alt="exo" width="280">
  </picture>
</p>

# exo

<p align="center">
  <strong>An exoskeleton for AI engineering. A plugin for Claude Code and Codex.</strong>
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

Describe what you want and Claude starts the skill that fits. A feature goes through four stages, and each asks which runs next. A bug goes to `find-cause` first. If you do not know a skill's name, type `/exo:start <goal>`.

| Stage | Skill | What it does |
|---|---|---|
| 1 | `spec` | Decides what to build. |
| 2 | `build` | Builds a plan or a decided change with subagents. |
| 3 | `verify` | Checks the branch before a pull request. |
| 4 | `ship` | Pushes, opens or merges the pull request. |

Other skills, written as you call them. Those with `/exo:` start only when you type them:

- `find-cause`: finds why something broke before any code changes.
- `refactor`: restructures code without changing what it does.
- `design-ui`: builds the real page or component directly, asks only when it cannot build without the answer, and finishes motion, reduced motion and every state.
- `/exo:check-docs`: looks up how the installed version of a library behaves.
- `/exo:write-docs`: writes READMEs, pull requests and commit messages.
- `/exo:file-issues`: writes GitHub issues and files them.
- `/exo:prompt`: rewrites a rough prompt and runs it after you say yes.
- `/exo:improve`: changes code in a loop against one fixed score command, keeps a commit only when the score gets better, and logs every round.
- `/exo:save-session`: saves unfinished work for a fresh session.
- `/exo:remember`: keeps a repository correction after two sessions have booked it.
- `/exo:run-plan`: builds a plan through `build`; `/exo:run-plan setup` installs `exo run <plan>` for your terminal.
- `/exo:configure`: shows or changes exo's settings.

[docs/skills/](docs/skills/) has a page for every skill. [docs/settings.md](docs/settings.md) covers the settings, including shorter replies and the status line.

## Before and after

Each "before" is plain Claude Code. Nothing here compares exo with other plugins.

| Before | After | Test |
|---|---|---|
| A task lands once Claude says the tests pass, even if the proof never failed. | A task lands only if its proof fails before the change and passes after; otherwise `no red proof`. | [tests/red-bound.test.mjs](tests/red-bound.test.mjs) |
| A task lands even when the project's own check is red. | A failing Land gate is refused before anything commits. | [tests/land-task-land-gate.test.mjs](tests/land-task-land-gate.test.mjs) |

On `value-test-pollution`, a suite that fails only in CI, plain Claude Code passed 0 of 5 runs and exo 2 of 5. Over all five benchmark tasks it was 18 of 25 against 20 of 25. That is 0.7 standard errors, so it does not separate them, and exo cost 1.38 times as much. See [the results](benchmarks/results/2026-10-21-h2h-baseline-exo.md).

## More

- [CONTRIBUTING.md](CONTRIBUTING.md): working on exo.
- [ABOUT.md](ABOUT.md): the words exo uses for its own parts.
- [benchmarks/README.md](benchmarks/README.md): paired runs of exo against a session without it.
- [CHANGELOG.md](CHANGELOG.md): what changed in each release.

[MIT](LICENSE) licensed.
