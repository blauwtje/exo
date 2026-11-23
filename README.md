<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img src="assets/logo-light.svg" alt="exo" width="280">
  </picture>
</p>

# exo

<p align="center">
  <strong>An exoskeleton for AI engineering. A plugin for Claude Code.</strong>
</p>

<p align="center">
  <a href="https://github.com/blauwtje/exo/actions/workflows/quality.yml"><img src="https://github.com/blauwtje/exo/actions/workflows/quality.yml/badge.svg" alt="quality"></a>
</p>

## Install

It needs git, Node 22 or newer, and `bash` on `PATH`.

Inside Claude Code, run these, then restart it:

```text
/plugin marketplace add blauwtje/exo
/plugin install exo@blauwtje
```

To check, type `/exo:` in a new session. If it lists exo's skills, exo is loaded.

<details>
<summary>Update or uninstall</summary>

Update with `claude plugin update exo@blauwtje` in a terminal, then restart. Uninstall with `/plugin uninstall exo@blauwtje`.

</details>

## Use

Say what you want in your own words and Claude starts the skill that fits. A typo or one-line edit runs without a skill, and a change of two files or fewer is edited directly, with no plan.

| You say | What happens |
|---|---|
| "rename the `--out` flag to `--output`" | A small fix: `build` edits directly, runs the check and offers to ship. |
| "plan how we add CSV export" | A feature with a plan: `spec` asks what only you can decide, then writes the plan. |
| "run the plan" | `build` builds each task with its proof and reviews the result once. |
| "the export writes duplicate rows, find out why" | A bug: `diagnose` proves the cause, then fixes it with a test. |
| "ship it" or "open a PR" | `ship` asks once how far the commits go, then pushes, opens or merges. |
| "save this session", then "continue from the handoff" in a new one | `save` writes a handoff file and reads it back. |
| a video link and a question | `watch` answers from the captions or a transcript. |
| "search for what people say about X" | `search` answers with links and quotes checked against saved sources from GitHub, Reddit, Hacker News and the web. |
| "give me ideas for how to approach X" | `ideas` runs a fixed ideation playbook and returns a short list of novel ideas. |
| "do not leave `console.log` in `src/`, remember this" | `learn` turns the correction into a lint rule or check that fails when it recurs, else a small lesson note, and starts by itself when you repeat a request. |
| "write a README for this" | `document` writes prose that is read later. |

The agents run behind the skills; you do not call them.

| Agent | What it does |
|---|---|
| `builder` | Builds one plan task, repair or fix, and writes the brief of a plan over 3 tasks. |
| `researcher` | Answers one bounded question from named sources. |

[guide/](guide/) has a page for every skill. [guide/settings.md](guide/settings.md) covers the settings, including shorter replies and the status line.

## Before and after

Each "before" is plain Claude Code. Nothing here compares exo with other plugins.

| Before | After | Test |
|---|---|---|
| A task lands once Claude says the tests pass, even if the proof never failed. | `land-task.mjs` runs the proof before the change too. When it passes there, the script refuses the task and the builder reports it `BLOCKED`. | [tests/red-bound.test.mjs](tests/red-bound.test.mjs) |
| A task lands even when the project's own check is red. | A failing Land gate is refused before anything commits. | [tests/land-task-land-gate.test.mjs](tests/land-task-land-gate.test.mjs) |

## More

- [CONTRIBUTING.md](CONTRIBUTING.md): working on exo.
- [ABOUT.md](ABOUT.md): the words exo uses for its own parts.
- [CHANGELOG.md](CHANGELOG.md): what changed in each release.

[MIT](LICENSE) licensed.
