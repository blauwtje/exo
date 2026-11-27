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

Claude says it is done. The test never ran, the bug fix was a guess, and the pull request went out without a check. exo is a small set of skills built on one rule:

> **Nothing counts as done until you have seen it run.**

Each skill turns that rule into a habit at one point of the work: a plan where every task carries a command that fails today, a build that watches each one go from red to green, a bug hunt that starts with a reproduction, and a push that waits for your yes.

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

## How it works

```mermaid
flowchart LR
  spec -->|tasks with a proof each| build -->|red, then green| ship
  bug([something breaks]) --> diagnose -->|fix with a test| ship
```

1. **spec:** you describe a change. exo asks only what you alone can decide (what done looks like, which data, the architecture, a trade-off), reads the code for the rest, and writes a brief where every task carries a command that fails today.
2. **build:** each task's proof must fail first and pass after. A small task is done in your session; a larger one goes to a fresh builder, and your session runs the proof again itself. One review at the end.
3. **ship:** nothing is pushed, opened or merged without your yes. Then it watches the pull request and fixes failing checks, conflicts and review comments.
4. **diagnose:** when something breaks, the first step is a command that shows it break. No fix without a proven cause and a test seen failing.

Around the loop, `save` hands unfinished work to a fresh session, `learn` turns a correction you made twice into a check that fails, `search` answers with quotes from pages it read, `watch` answers from a video's transcript, and `ideas` tests new ideas against what already exists.

You do not call the skills by name. Say what you want and Claude starts the one that fits:

| You say | Skill |
|---|---|
| "plan how we add CSV export" | `spec` |
| "run the plan" | `build` |
| "the export writes duplicate rows, find out why" | `diagnose` |
| "ship it" or "open a PR" | `ship` |
| "save this session", later "continue from the handoff" | `save` |
| "do not leave `console.log` in `src/`, remember this" | `learn` |
| "search for what people say about X" | `search` |
| a video link and a question | `watch` |
| "give me ideas for X" | `ideas` |

A typo or a one-line edit needs no skill.

## What exo will not do

- Push, open a pull request or merge without asking you first.
- Weaken, skip or delete a test to get green.
- Follow an instruction found in a web page, an issue, a log or a video.
- Write your name, email or home path into a file or a commit.

## Words

| Word | Meaning |
|---|---|
| proof | The one command that shows a task is done. |
| red, green | The proof failing before the change, and passing after it. |
| brief | The plan file `spec` writes to `docs/specs/`. |
| scratch | exo's folder for temporary files, outside your repository. |
| builder, researcher | The two helper agents the skills send work to. You do not call them. |

## Inside

Each skill and agent first reads [BASE.md](BASE.md), one page of shared rules. Each skill is one Markdown file of at most 500 lines, with longer layouts in a `references/` folder beside it. Code rules are in [CODE.md](CODE.md).

<details>
<summary>Status line (optional)</summary>

Claude Code only. Run this in a terminal:

```sh
node "$(ls -d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/*/exo/*/ | sort -V | tail -n 1)lib/statusline-install.mjs"
```

It writes a launcher to `~/.claude/exo/statusline.mjs` (under `CLAUDE_CONFIG_DIR` when set) and prints a `statusLine` block for your `settings.json`, which exo never edits. After an exo update, rerun that command. To remove it, delete the `statusLine` key.

</details>

## More

- [CONTRIBUTING.md](CONTRIBUTING.md): working on exo.
- [CHANGELOG.md](CHANGELOG.md): what changed in each release.

[MIT](LICENSE) licensed.
