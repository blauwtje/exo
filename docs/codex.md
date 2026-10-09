# exo on Codex

exo runs in the Codex CLI on ChatGPT models priced and sized like their Claude counterparts. Claude Code stays the primary host.

The Codex desktop app loads the same skills from `~/.agents/skills/`, but whether it runs exo's hooks and agents is untested.

## Plan

exo's agents run on `gpt-6.1-sol` and `gpt-6-luna`, so you need a plan that includes Sol: Plus, Pro, Business, Enterprise or Edu. Free and Go have only Luna and are unsupported.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/blauwtje/exo/main/install.sh | bash -s -- --harness codex
```

A Codex plugin carries no custom agents and does not run in the IDE extension, so exo installs from a clone, by default `~/.exo`, and ships no Codex plugin.

To update exo, run:

```bash
curl -fsSL https://raw.githubusercontent.com/blauwtje/exo/main/install.sh | bash -s -- --update
```

The script pulls the clone with `git pull --ff-only`, then updates every install exo recorded, in Codex and in Claude Code.

To uninstall exo, run:

```bash
curl -fsSL https://raw.githubusercontent.com/blauwtje/exo/main/install.sh | bash -s -- --remove
```

The script removes every install exo recorded, or only those matching `--harness`, `--scope` and `--project` when you add them. It then deletes `~/.exo` when no install is left and the clone has no local changes.

## What the installer writes

| Scope | Writes |
|---|---|
| `user` | Skills to `~/.agents/skills/`, agents to `~/.codex/agents/`, hook entries to `~/.codex/hooks.json`, under `$CODEX_HOME` when set. |
| `project` | The same under `<project>/.agents/` and `<project>/.codex/`. Needs the clone at `~/.exo`. |
| `local` | The same as `project`, and adds each path to `<project>/.git/info/exclude`. |

The installer records each install in `~/.codex/exo/installed.json`. It never overwrites or removes a file, folder or hook entry it did not write. It never edits `config.toml`, and it writes nothing when `hooks.json` does not parse.

`$configure` writes the global settings layer to `~/.codex/exo/settings.json`. The project and local layers stay `.claude/exo.json` and `.claude/exo.local.json`.

## What differs from Claude Code

Codex has no equivalent for some Claude Code features, so exo drops or approximates them.

| Feature | On Codex |
|---|---|
| Delegate budget | Dropped. Codex has a different transcript. |
| An agent's tool allowlist | Becomes a `read-only` or `workspace-write` sandbox. |
| `maxTurns` | No field. |
| Skill `model` and `effort` | Skills run at the session's model. |
| `start`, `save-session`, `remember` | Explicit only, as `$start`, `$save-session` and `$remember`. |

How the Codex files are generated and installed is in [CONTRIBUTING.md](../CONTRIBUTING.md#codex).
