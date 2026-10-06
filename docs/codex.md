# exo on Codex

exo runs in the Codex CLI on ChatGPT models priced and sized like their Claude counterparts. Claude Code stays the primary host.

## Plan

exo's agents run on `gpt-6.1-sol` and `gpt-6-luna`, so you need a plan that includes Sol: Plus, Pro, Business, Enterprise or Edu. Free and Go have only Luna and are unsupported.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/blauwtje/exo/main/install.sh | bash -s -- --harness codex
```

Without the script, clone and run the installer yourself:

```bash
git clone https://github.com/blauwtje/exo ~/.exo && node ~/.exo/install.mjs --harness codex
```

A Codex plugin carries no custom agents and does not run in the IDE extension, so exo installs from a clone, by default `~/.exo`, and ships no Codex plugin.

`node ~/.exo/install.mjs --update` pulls the clone with `git pull --ff-only`, then updates every install it recorded, in Codex and in Claude Code. `node ~/.exo/install.mjs --remove` removes every install it recorded, or only those matching `--harness`, `--scope` and `--project`.

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
| Read guard, repeat guard on `Edit` and `Write`, delegate budget, terse display filter, `Stop` checks | Dropped. Codex has no `Read` tool, no `MessageDisplay` event and a different transcript. |
| Output style `scannable` | Injected at session start, because Codex has no output styles. |
| An agent's tool allowlist | Becomes a `read-only` or `workspace-write` sandbox. |
| `maxTurns` | No field. |
| Skill `model` and `effort` | Skills run at the session's model. |
| `start`, `save-session`, `remember` | Explicit only, as `$start`, `$save-session` and `$remember`. |

How the Codex files are generated and installed is in [CONTRIBUTING.md](../CONTRIBUTING.md#codex).
