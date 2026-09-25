# exo

[![quality](https://github.com/blauwtje/exo/actions/workflows/quality.yml/badge.svg)](https://github.com/blauwtje/exo/actions/workflows/quality.yml)

exo is a Claude Code plugin that gives Claude one way of working: decide what to build, plan it, build it and review it, each as its own step. It is built for the ways a long session goes wrong: code nobody asked for, whole files read to find one function, and a context so full that earlier decisions drop out of it.

## Install

```text
/plugin marketplace add blauwtje/exo
/plugin install exo@blauwtje
```

Restart Claude Code afterwards. The session hook needs `bash`, `jq` and `node` on `PATH`.

## Check that it works

Start a new session and run:

```text
/exo:show-savings
```

It prints the savings report, which says nothing was refused yet until the read guard has kept a read out of context. In a clone of this repository, `npm run check` runs every check.

## How exo works

- **Steps.** A request is shaped, planned, built and reviewed in that order, and a failure is diagnosed before anything is fixed. Each step ends by asking which step runs next and on which model.
- **Helpers.** Searches, builds and reviews run in a helper: a separate Claude context with its own instructions and a named model, so its file dumps never reach your session. Code search runs in the `exo:locate-code` agent on Haiku, the discovery of a redesign in the `exo:survey-ui` agent on Sonnet at high effort, the final branch review in the `exo:review-branch` agent on Opus at medium effort for a branch of at most five changed files and 200 changed lines and in `exo:review-branch-deep` at high effort above that, the post-build design critique in the `exo:critique-ui` agent on Opus at medium effort, and documentation research in the `exo:fetch-docs` agent on Sonnet with web and read tools only; all six live under `agents/`.
- **The ladder.** Before every edit that adds code, Claude checks whether the code is needed and whether something already does it; the ladder below lists the checks.
- **The read guard.** A hook on `Read` refuses to read a file of over 400 lines in one go (the default; `/exo:configure guard-lines <lines>` changes it), and refuses to read lines again that have not changed since the last read. It hooks `Read` only: file content read through Bash, as `cat` or `sed` reads it, is neither refused nor counted.
- **The savings counter.** The read guard books the bytes of every read it refuses; `/exo:show-savings` prints them as an estimated token saving.

A session hook loads these rules at startup, resume, clear and compaction, so they hold without calling a skill.

## Skills

Every skill is invoked as `/exo:<name>`. The first group Claude may also start on its own when its trigger matches; the second runs only when you type it.

### Model-invoked

| Skill | Use it when |
|---|---|
| `define-scope <outcome>` | A request names a result but leaves open what counts as done, what data it holds or which architecture carries it. |
| `draft-plan <topic, spec or issue>` | A plan is asked for, a planning mode is active, or the work has two or more edit-order dependencies. A shaped issue plans without shaping again. |
| `run-plan [plan]` | A plan runs or resumes: one delegated build and one commit per task, independent tasks built together in worktrees of their own, then one branch review. A plan of three tasks or fewer builds in the session. |
| `build-change <change>` | A decided change builds in this session and touches more than two files, a dependency, a public signature, a persisted format or a security boundary, or you ask for it test-first, at any file count. |
| `ship [numbers]` | A code-changing run ends, or you ask to push, open a pull request or merge open pull requests: one question, then the route you pick runs to its end behind gates read from the GitHub API. |
| `find-cause <symptom>` | Existing behavior fails and the cause is not yet proven. Outranks every other stage until it is. |
| `audit-architecture [path]` | You want to know where the architecture should improve without naming the change. |
| `design-ui <surface>` | A page, component or visual axis changes: typography, color, spacing, motion, copy. |
| `explain-code <how, why or teach, and the code in question>` | You ask how part of this repository works, why it's built that way, or to be taught it, each claim marked verified, inferred or unknown. |
| `file-issues <scope>` | You ask in plain words to file GitHub issues: they are created as specs, with the labels, type, relations, milestone and project fields the repository defines. |
| `try-idea <question>` | A decision about logic, state or data flow needs running code first: a throwaway that answers it, parked on its own branch while only the decision reaches real code. |
| `refactor <the refactor to run>` | A named refactor, rename, move or internal API reshape must keep behavior unchanged, with no shim or compatibility re-export left behind. |
| `check-docs <library, version, question>` | A decision hinges on how a pinned external version behaves and a wrong guess would still compile. |
| `edit-skills <skill>` | A skill or agent is created, edited or judged too long. |
| `check-impact <the diff, branch or claim to check>` | You ask whether a diff is safe to merge or ship, what a change could break, or build on a claim that existing code already handles something or nothing uses it: the claim is proven by running the real code. |
| `write-docs <the document or text to write or edit>` | Prose someone reads later is written or edited: a README or doc page, a pull request, issue or commit body, a changelog line, a brief or spec. |
| `show-savings` | You ask what exo saved or what the read guard kept out of context. |
| `configure [key value scope]` | You set up exo with no argument, or show or change one setting, the savings counter and the read guard included, for every project, one repository, or this machine only. |
| `route-skills` | Injected at every session start, resume, clear and compaction. It names the other skills and their order. |

### User-invoked

These carry `disable-model-invocation: true`, so Claude never starts one itself: each writes a record only you should approve or runs a long or costly job only you should start.

| Skill | Use it when |
|---|---|
| `save-session` | You save an unfinished session's live state to a file a fresh session reads after a clear. |
| `remember` | You record what this repository taught exo, approve a claim two sessions have booked, or drop a line whose files are gone. |
| `run-parallel <coverage, race, gauntlet or arena> <done predicate or artifact> [N]` | You fan one job out to parallel workers for split coverage, a race, a gauntlet of checks or an arena of candidates, with every rule that judges them fixed before the first one runs. |
| `tune-metric <metric and direction> <target and attempt floor>` | You push one measured metric toward a target in an unattended loop that keeps or reverts each change against a frozen harness. |
| `compare-renders <surfaces and the URL that renders them>` | You prove that a refactor, migration or dependency bump leaves every rendered surface pixel-identical to a baseline captured before the first edit. |

Each skill also has a page under `docs/skills/`, written for a person: what the skill is for and what it leaves behind, without the instruction the model reads.

`skills/drafts/` stages a skill that is written but not loaded. A plugin loader discovers `skills/<name>/SKILL.md` only and does not recurse, so nothing staged there is listed, invoked or counted against a budget. Promotion means all five of: the folder moves to `skills/<name>/`, the name joins `EXPECTED_SKILLS` in `verify/budgets.mjs`, it gets a reference contract in `verify/checks/reference-tables.mjs`, its description is paid for in the description budgets, and it gets a page under `docs/skills/`.

## The ladder

Before every edit that adds or replaces code, Claude takes the first rung that fits:

1. Need: nothing is built for a use the request does not name.
2. Reuse: what the repository already has is called, not copied.
3. Borrow: the standard library, then a platform feature, then an installed dependency, and no new dependency for ten lines.
4. Write: new code comes last, as few statements as pass, one action per line.

On every rung, checks at a trust boundary, failure handling that keeps data from being lost, anything security depends on, accessibility and anything you asked for by name are built completely.

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
| `context` | a whole number of at least 1 | `100` | Thousands of tokens the main session's context may reach. From it, a tool call adds a note to finish the current step and hand off with `/exo:save-session` and `/clear`, once per further 25k, shown to you as well from 150k. A stored value that is not a whole number of at least 1 reads as the default. |

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
