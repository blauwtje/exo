# exo

[![quality](https://github.com/blauwtje/exo/actions/workflows/quality.yml/badge.svg)](https://github.com/blauwtje/exo/actions/workflows/quality.yml)

exo is a Claude Code plugin that gives Claude one way of working: decide what to build, build it and review it, each as its own step. It is built for the ways a long session goes wrong: code nobody asked for, whole files read to find one function, and a context so full that earlier decisions drop out of it.

## Install

```text
/plugin marketplace add blauwtje/exo
/plugin install exo@blauwtje
```

Restart Claude Code afterwards. The session hook needs `bash`, `jq` and `node` on `PATH`.

exo needs a subagent spawn depth of at least 2 in `~/.claude/settings.json`; Claude Code 2.1.219 and later default to 3, so this entry only matters on 2.1.217, 2.1.218, or wherever something has set a lower value:

```json
{
  "env": {
    "CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH": "2"
  }
}
```

`run-plan` dispatches a `run-unit` agent that dispatches `exo:build-task` agents, so a subagent must be able to spawn subagents of its own ([subagents](https://code.claude.com/docs/en/sub-agents#let-subagents-spawn-their-own-subagents)).

## Check that it works

Start a new session and run:

```text
/exo:show-savings
```

It prints the savings report, which says nothing was refused yet until the read guard has kept a read out of context. In a clone of this repository, `npm run check` runs every check.

## How exo works

- **Steps.** A request is shaped, built and reviewed in that order, and a failure is diagnosed before anything is fixed. Each step ends by asking which step runs next and on which model.
- **Helpers.** Searches, builds and reviews run in a helper: a separate Claude context with its own instructions and a named model, so its file dumps never reach your session. Code search runs in the `exo:locate-code` agent on Haiku, the discovery of a redesign in the `exo:survey-ui` agent on Sonnet at high effort, the final branch review in the `exo:review-branch` agent on Opus at medium effort for a branch of at most five changed files and 200 changed lines and in `exo:review-branch-deep` at high effort above that, the post-build design critique in the `exo:critique-ui` agent on Opus at medium effort, and documentation research in the `exo:fetch-docs` agent on Sonnet with web and read tools only; all six live under `agents/`.
- **The ladder.** Before every edit that adds code, Claude checks whether the code is needed and whether something already does it; the ladder below links to the checks.
- **The read guard.** A hook on `Read` refuses to read a file of over 400 lines in one go (the default; `/exo:configure guard-lines <lines>` changes it), and refuses to read lines again that have not changed since the last read. It hooks `Read` only: file content read through Bash, as `cat` or `sed` reads it, is neither refused nor counted.
- **The savings counter.** The read guard books the bytes of every read it refuses; `/exo:show-savings` prints them as an estimated token saving.

A session hook loads these rules at startup, resume, clear and compaction, so they hold without calling a skill.

## Skills

Every skill is invoked as `/exo:<name>`. Don't remember a name? Type `/exo:start`, or `/exo:start <goal>`, and it shows this list in plain words or picks one for you. The first group below Claude may also start on its own when its trigger matches; the rest run only when you type them.

### Model-invoked

| Skill | What it does | Just say |
|---|---|---|
| `define-scope <outcome>` | Decides what "done" means, when that is still open: the result, the data, the architecture. | "I want something for X but I'm not sure what exactly" |
| `run-plan [plan]` | Runs a plan file, with helpers and review. | "run the plan at docs/...", or after `/clear`: "carry on" |
| `build-change <change>` | Builds a decided change, test-first where it can. | "build X", "fix this bug, here's how to reproduce it" |
| `ship [numbers]` | Pushes, opens or merges a pull request, fixes its checks or review comments. | "push this", "merge the PR", "fix the checks" |
| `find-cause <symptom>` | Finds the real cause of a failure before fixing it. | "this doesn't work", "why does X crash?" |
| `design-ui <surface>` | Designs or improves how a screen looks. | "make this page nicer", "new component" |
| `explain-code <how, why or teach, and the code in question>` | Explains how or why code works the way it does. | "how does X work?", "why is this built this way?" |
| `file-issues <scope>` | Files GitHub issues. | "turn this into issues" |
| `refactor <the refactor to run>` | Restructures code without changing its behavior. | "rename X", "move Y", "split this module" |
| `edit-skills <skill>` | Writes or improves a skill or agent. | "fix skill X", "make an agent that ..." |
| `check-impact <the diff, branch or claim to check>` | Says what a change could break, with evidence. | "is this safe to merge?", "what does this break?" |
| `write-docs <the document or text to write or edit>` | Writes a README, docs page, PR or commit text. | "write the README", "PR description" |
| `show-savings` | Shows how many tokens exo saved. | "what did exo save?" |
| `configure [key value scope]` | Shows or changes an exo setting. | "set context to 120" |

### User-invoked

These carry `disable-model-invocation: true`, so Claude never starts one itself: `start` shows the skills when you ask, and `save-session` and `remember` write a record only you should approve. The flag also keeps `route-skills` and the three long runs under Rarely needed (`compare-renders`, `run-parallel`, `tune-metric`) for you to start.

| Skill | What it does | Just say |
|---|---|---|
| `start [goal]` | Shows this list, or picks the one skill for a stated goal. | Type `/exo:start` when no skill name comes to mind |
| `save-session` | Saves where a session is, for a fresh one after `/clear`. | Type `/exo:save-session`, then `/clear` |
| `remember` | Books a correction about this repository, or approves a claim two sessions have booked. | Type `/exo:remember` |

### Rarely needed

Skills for a case most sessions never hit; still worth knowing about.

| Skill | What it does | Just say |
|---|---|---|
| `check-docs <library, version, question>` | Checks how a pinned library, API or service actually behaves. | "does this still hold for version X of Y?" |
| `try-idea <question>` | Builds a throwaway prototype to find out. | "try whether ...", "proof of concept" |
| `audit-architecture [path]` | Finds where the architecture should change. | "where's the tech debt?" |
| `compare-renders <surfaces and the URL that renders them>` | Proves screens stayed pixel-identical after a refactor. | Type `/exo:compare-renders` |
| `run-parallel <coverage, race, gauntlet or contest> <done predicate or artifact> [N]` | Hands one job to parallel helpers. | Type `/exo:run-parallel` |
| `tune-metric <metric and direction> <target and attempt floor>` | Pushes one metric up in a loop that reverts itself. | Type `/exo:tune-metric` |

`route-skills` holds the routing rules every other skill follows. The session hook injects it at every start, resume, clear and compaction, so it is never picked; type `/exo:route-skills` to read it.

Each skill also has a page under `docs/skills/`, written for a person: what the skill is for and what it leaves behind, without the instruction the model reads.

A new skill needs all of: the folder at `skills/<name>/`, the name joining `EXPECTED_SKILLS` in `verify/budgets.mjs`, a reference contract in `verify/checks/reference-tables.mjs`, its description paid for in the description budgets, and a page under `docs/skills/`.

## The ladder

`skills/route-skills/references/ladder.md` holds the ladder Claude takes before every edit that adds or replaces code: the rungs, the tie-break between them, and what is never shortened on any rung.

## Savings

`/exo:show-savings` prints a short ledger over every session of the last 30 days, in every project: the tokens the read guard kept out of context, split into the big-file reads and the repeated reads it refused. The figure is a local estimate from the bytes of the refused text at 3.5 characters per token, the ratio Anthropic documents; nothing in it is measured or billed, and the report prints no cost.

To refuse fewer reads, raise the big-file limit, or set `"readGuard": false` in `~/.claude/exo/savings/config.json` to switch the guard off alone:

```text
/exo:configure guard-lines 800
```

One switch turns the counter, the status line segment and the read guard off together:

```bash
node "$(cat ~/.claude/exo/plugin-root)/skills/show-savings/scripts/savings.mjs" off   # or on, status, report
```

`EXO_SAVINGS=off` in the environment outranks the file it writes. To show the running estimate in your status line, add this after your script has read stdin into `$input`:

```bash
plugin_root_file="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/exo/plugin-root"
if [ -f "$plugin_root_file" ]; then
  savings=$(printf '%s' "$input" | node "$(cat "$plugin_root_file")/skills/show-savings/scripts/savings.mjs" statusline 2>/dev/null)
  [ -n "$savings" ] && printf ' · %s' "$savings"
fi
```

The segment reads `exo ≈449k tokens saved`; it reads the record the Stop hook keeps and nothing from stdin.

## Settings

exo reads each setting from four layers, highest first: `.claude/exo.local.json` (this machine, git-ignored), `.claude/exo.json` (the repository, committed so every collaborator shares it), the plugin's global options, then the default. The global options are asked when the plugin is enabled and change later in `/config`; `/exo:configure` shows every value with its layer and writes the two repository files.

| Key | Values | Default | Effect |
|---|---|---|---|
| `specs` | `docs`, `issues`, `both` | `docs` | Where `define-scope` stores a spec: `docs/specs/`, a GitHub issue marked as shaped, or both. Without git, a GitHub remote or a signed-in `gh`, it writes the file. |
| `replies` | `tight`, `standard` | `tight` | How replies are written. `tight` drops preamble, recap and filler and keeps code, paths, errors and warnings whole; `standard` writes full prose. An output style outranks it. |
| `context` | a whole number of at least 1 | `100` | Thousands of tokens the main session's context may reach. From it, a tool call adds a note, shown to you as well, once per further 25k: to finish the current step and hand off with `/exo:save-session` and `/clear`, or, while `exo:define-scope` or `exo:run-plan` is the last exo skill loaded, to keep working because the harness compacts on its own. A stored value that is not a whole number of at least 1 reads as the default. |

## Develop

```bash
npm install
npm run check            # the gate before any commit: verifier, self-test and script tests
claude --plugin-dir .    # run the working tree instead of the installed copy
```

`CONTRIBUTING.md` covers the checks, how skills hand work to helpers, the hooks and the savings counter. `benchmarks/README.md` covers the paired runs that measure exo against a session without it.

A change lands under `## Unreleased` in `CHANGELOG.md` without a version change, so the installed plugin updates only on a release. `CLAUDE.md` lists the release steps.

## License

[MIT](LICENSE): use it, change it and share it for any purpose, commercial included.
