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

```bash
curl -fsSL https://raw.githubusercontent.com/blauwtje/exo/main/install.sh | bash
```

The script clones exo to `~/.exo`, checks for git and Node 22 or newer, then asks which harnesses get exo (Claude Code, Codex) and for which projects. Start a new session and run `/exo:configure` (`$configure` in Codex). A list of exo settings means it loaded.

| Other ways | Command |
|---|---|
| Codex only | `curl -fsSL https://raw.githubusercontent.com/blauwtje/exo/main/install.sh \| bash -s -- --harness codex` |
| Claude Code only, from inside it | `/plugin marketplace add blauwtje/exo`, then `/plugin install exo@blauwtje` |
| Without piping a script | `git clone https://github.com/blauwtje/exo ~/.exo && node ~/.exo/install.mjs` |
| Update | `node ~/.exo/install.mjs --update` |
| Remove | `node ~/.exo/install.mjs --remove` |

The hooks need `bash` on `PATH`. On Windows, Git Bash runs them, and support is best effort. Codex needs a ChatGPT plan with Sol and drops a few Claude-only features: see [docs/codex.md](docs/codex.md).

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
