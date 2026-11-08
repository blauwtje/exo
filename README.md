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

To check, run `$configure` in a new session. [docs/codex.md](docs/codex.md) names the ChatGPT plan it needs and lists what differs from Claude Code.

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

Describe what you want and Claude starts the skill that fits. The routing rule: Unclear: spec. Clear: build. Broken: find-cause. Leaving the machine: ship. About exo: save-session or configure. A feature goes through four stages, and each asks which runs next.

| Skill | What it does | Modes |
|---|---|---|
| `spec` | Decides what to build. | research, ideate |
| `build` | Builds a plan or a decided change with subagents. | run-plan, refactor, improve, design-ui |
| `gate` | Checks the branch before a pull request. | review |
| `ship` | Pushes, opens or merges the pull request. | |
| `find-cause` | Finds why something broke before any code changes. | |
| `edit-skills` | Edits exo's own skills and prompts. | prompt |
| `save-session` | Saves unfinished work for a fresh session. | |
| `configure` | Shows or changes exo's settings. | |
| `watch` | Reads videos from YouTube, TikTok, Instagram, Facebook, X and other yt-dlp sites, through their captions or a local transcript, and answers, summarises or extracts from them. | |
| `write-docs` | Writes READMEs, pull requests and commit messages. | |

The agents run behind the skills; you do not call them.

| Agent | What it does |
|---|---|
| `orchestrator` | Runs a multi-part task with up to 4 workers. |
| `build-task` | Builds one plan task, folding the hard-problem and review-fix work. |
| `task-runner` | Runs the build loop for a plan session. |
| `review-branch` | Reviews a branch for gate, folding the claim judge. |
| `research-worker` | Answers one bounded question from named sources, folding the docs fetch, idea and open-point work. |

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
