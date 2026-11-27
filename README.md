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
| "search for what people say about X" | `search` answers with links and quotes from saved sources from GitHub, Reddit, Hacker News and the web. |
| "give me ideas for how to approach X" | `ideas` runs a fixed ideation playbook and returns a short list of novel ideas. |
| "do not leave `console.log` in `src/`, remember this" | `learn` turns the correction into a lint rule or check that fails when it recurs, else a small lesson note. |

The agents run behind the skills; you do not call them.

| Agent | What it does |
|---|---|
| `builder` | Builds one plan task, repair or fix, and writes the brief of a plan over 3 tasks. |
| `researcher` | Answers one bounded question from named sources. |

Each skill is one Markdown file of at most 500 words. Step 1 of each reads [BASE.md](BASE.md), the principles every skill shares, each with its reason.

## Status line

Claude Code only. Run this in a terminal:

```sh
node "$(ls -d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/*/exo/*/ | sort -V | tail -n 1)lib/statusline-install.mjs"
```

It writes a launcher to `~/.claude/exo/statusline.mjs` (under `CLAUDE_CONFIG_DIR` when set) and prints a `statusLine` block for your `settings.json`, which exo never edits. After an exo update, rerun that command. To remove it, delete the `statusLine` key.

## More

- [CONTRIBUTING.md](CONTRIBUTING.md): working on exo.
- [CHANGELOG.md](CHANGELOG.md): what changed in each release.

[MIT](LICENSE) licensed.
