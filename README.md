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
/exo:savings status
/exo:savings
```

The first prints `on`. The second prints the cost report, which stays at zero until exo has done some work. In a clone of this repository, `npm run check` runs every check.

## How exo works

- **Steps.** A request is shaped, planned, built and reviewed in that order, and a failure is diagnosed before anything is fixed. Each step ends by asking which step runs next and on which model.
- **Helpers.** Searches, builds and reviews run in a helper: a separate Claude context with its own instructions and a named model, so its file dumps never reach your session. Code search runs in the `exo:explorer` agent on Haiku, and the final branch review and the post-build design critique run in the `exo:branch-reviewer` and `exo:design-critic` agents on Opus at high effort; all three live under `agents/`.
- **The ladder.** Before every edit that adds code, Claude checks whether the code is needed and whether something already does it; the ladder below lists the checks.
- **The read guard.** A hook on `Read` refuses to read a file of over 400 lines in one go (the default; `/exo:savings guard-lines <lines>` changes it), and refuses to read lines again that have not changed since the last read.
- **The savings counter.** A hook books what exo's own work cost and which reads the read guard refused; `/exo:savings` prints the report.

A session hook loads these rules at startup, resume, clear and compaction, so they hold without calling a skill.

## Skills

Every skill is invoked as `/exo:<name>`; the model may also start one when its trigger matches.

### Stages

| Skill | Use it when |
|---|---|
| `shaping <outcome>` | A request names a result but leaves open what counts as done, what data it holds or which architecture carries it. |
| `planning <topic, spec or issue>` | A plan or handoff is asked for, a planning mode is active, or the work has two or more edit-order dependencies. A shaped issue plans without shaping again. |
| `implementing [plan]` | A plan runs or resumes: one delegated build and one commit per task, independent tasks built together in worktrees of their own, then one branch review. |
| `implementing-batch <change>` | A decided change builds in this session and touches more than two files, a dependency, a public signature, a persisted format or a security boundary. |
| `debug <symptom>` | Existing behavior fails and the cause is not yet proven. Outranks every other stage until it is. |
| `deepen [path]` | You want to know where the architecture should improve without naming the change. |

### Support

| Skill | Use it when |
|---|---|
| `designing <surface>` | A page, component or visual axis changes: typography, color, spacing, motion, copy. |
| `research <library, version, question>` | A decision hinges on how a pinned external version behaves and a wrong guess would still compile. |
| `skills-tool <skill>` | A skill or agent is created, edited or judged too long. |
| `savings [report, on, off, status, guard-lines]` | You ask what exo cost or refused, switch the savings counter and read guard off or on, or change the guard's big-file limit. |
| `settings [key value scope]` | You show or change an exo setting for every project, one repository, or this machine only. |
| `using-exo` | Injected at every session start, resume, clear and compaction. It names the other skills and their order. |

### Workflows

These leave the machine, so only you can start them.

| Skill | Use it when |
|---|---|
| `issuing <scope>` | You file GitHub issues as specs, with the labels and fields the repository defines. |
| `merge-prs [numbers]` | You merge open pull requests behind gates read from the GitHub API. |

## The ladder

Before every edit that adds or replaces code, Claude takes the first rung that fits:

1. Need: nothing is built for a use the request does not name.
2. Reuse: what the repository already has is called, not copied.
3. Borrow: the standard library, then a platform feature, then an installed dependency, and no new dependency for ten lines.
4. Write: new code comes last, as few statements as pass, one action per line.

On every rung, checks at a trust boundary, failure handling that keeps data from being lost, anything security depends on, accessibility and anything you asked for by name are built completely.

## Savings

`/exo:savings` prints a short report over every session of the last 30 days, in every project: what exo's own work cost at API list price with its calls and time, and the reads the read guard refused with their file text in bytes. What exo saved is not measured, and the report says so: refused text was never sent, so it has no token count or price.

To refuse fewer reads, raise the big-file limit, or set `"readGuard": false` in `~/.claude/exo/savings/config.json` to switch the guard off alone:

```text
/exo:savings guard-lines 800
```

One switch turns the counter, the status line segment and the read guard off together:

```bash
node "$(cat ~/.claude/exo/plugin-root)/skills/savings/scripts/savings.mjs" off   # or on, status, report
```

`EXO_SAVINGS=off` in the environment outranks the file it writes. To show the running total in your status line, add this after your script has read stdin into `$input`:

```bash
plugin_root_file="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/exo/plugin-root"
if [ -f "$plugin_root_file" ]; then
  savings=$(printf '%s' "$input" | node "$(cat "$plugin_root_file")/skills/savings/scripts/savings.mjs" statusline 2>/dev/null)
  [ -n "$savings" ] && printf ' · %s' "$savings"
fi
```

The segment reads `exo cost $0.04 · 2m · 2 reads refused`.

## Settings

exo reads each setting from four layers, highest first: `.claude/exo.local.json` (this machine, git-ignored), `.claude/exo.json` (the repository, committed so every collaborator shares it), the plugin's global options, then the default. The global options are asked when the plugin is enabled and change later in `/config`; `/exo:settings` shows every value with its layer and writes the two repository files.

| Key | Values | Default | Effect |
|---|---|---|---|
| `specs` | `docs`, `issues`, `both` | `docs` | Where `shaping` stores a spec: `docs/specs/`, a GitHub issue marked as shaped, or both. Without git, a GitHub remote or a signed-in `gh`, it writes the file. |
| `replies` | `tight`, `standard` | `tight` | How replies are written. `tight` drops preamble, recap and filler and keeps code, paths, errors and warnings whole; `standard` writes full prose. An output style outranks it. |

## Develop

```bash
npm install
npm run check            # the gate before any commit: verifier, self-test and script tests
claude --plugin-dir .    # run the working tree instead of the installed copy
```

`CONTRIBUTING.md` covers the checks, the evals, how skills hand work to helpers, the hooks and the savings counter. `benchmarks/README.md` covers the paired runs that measure exo against a session without it.

A change lands under `## Unreleased` in `CHANGELOG.md` without a version change, so the installed plugin updates only on a release. `CLAUDE.md` lists the release steps.

## License

[PolyForm Noncommercial 1.0.0](LICENSE): use it, change it and share it for any noncommercial purpose.
