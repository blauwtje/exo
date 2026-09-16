# exo

[![quality](https://github.com/blauwtje/exo/actions/workflows/quality.yml/badge.svg)](https://github.com/blauwtje/exo/actions/workflows/quality.yml)

One engineering process for Claude Code, packaged as a plugin. Skills take turns from shaping to merge, delegates keep discovery and builds out of the main context, and a ledger shows what the plugin cost and what it kept out.

## Install

```text
/plugin marketplace add blauwtje/exo
/plugin install exo@blauwtje
```

Restart Claude Code afterwards. The session hook needs `bash`, `jq` and `node` on `PATH`.

## Why

- **Stages, not a chat.** A request is shaped before it is planned, planned before it is built, and a failure is diagnosed before anything is fixed. Each stage ends by asking which stage runs next and on which model.
- **The main context keeps the decisions.** Codebase discovery, builds, reviews and documentation reads run in delegates with their own prompts, so file dumps never land in the session.
- **Right-sized code.** Before every edit the model settles a four-rung ladder and takes the first rung that fits: leave out what no request needs, reuse what the repository has, borrow from the standard library, the platform or an installed dependency, and write new code last, as little as passes.
- **Measured, not claimed.** A read guard refuses unbounded and repeated reads, and a ledger books every figure the API reported. Nothing is estimated.

## Skills

Every skill is invoked as `/exo:<name>`; the model may also start one when its trigger matches.

### Stages

| Skill | Use it when |
|---|---|
| `shaping <outcome>` | A request names a result but leaves open what counts as done, what data it holds or which architecture carries it. |
| `planning <topic, spec or issue>` | A plan or handoff is asked for, a planning mode is active, or the work has two or more edit-order dependencies. A shaped issue plans without shaping again. |
| `implementing [plan]` | A plan runs or resumes: one delegated build and one commit per task, then one branch review. |
| `implementing-batch <change>` | A decided change builds in this session and touches more than two files, a dependency, a public signature, a persisted format or a security boundary. |
| `debug <symptom>` | Existing behavior fails and the cause is not yet proven. Outranks every other stage until it is. |
| `deepen [path]` | You want to know where the architecture should improve without naming the change. |

### Support

| Skill | Use it when |
|---|---|
| `designing <surface>` | A page, component or visual axis changes: typography, color, spacing, motion, copy. |
| `research <library, version, question>` | A decision hinges on how a pinned external version behaves and a wrong guess would still compile. |
| `skills-tool <skill>` | A skill or agent is created, edited or judged too long. |
| `savings [report, on, off, status]` | You ask what exo cost or withheld, or switch the ledger and read guard off or on. |
| `settings [key value scope]` | You show or change an exo setting for every project, one repository, or this machine only. |
| `using-exo` | Injected at every session start, resume, clear and compaction. It names the other skills and their order. |

### Workflows

These leave the machine, so only you can start them.

| Skill | Use it when |
|---|---|
| `issuing <scope>` | You file GitHub issues as specs, with the labels and fields the repository defines. |
| `merge-prs [numbers]` | You merge open pull requests behind gates read from the GitHub API. |

## How it works

**The session hook** injects the `using-exo` body at startup, resume, clear and compaction. That body holds the skill precedence, the right-sizing ladder and the closing rules, so the model carries them without invoking a skill.

**Delegates** are the harness's own general-purpose agent with a role prompt that sits beside the dispatching skill. The skill names the model per call: `sonnet` for mechanical builds, discovery and documentation reads, `opus` for debugging, plan repair, design critique and the branch review.

**The ladder** holds before every edit that adds or replaces code:

1. Need: nothing is built for a use the request does not name.
2. Reuse: what the repository already has is called, not copied.
3. Borrow: the standard library, then a platform feature, then an installed dependency, and no new dependency for ten lines.
4. Write: new code comes last, as few statements as pass, one action per line.

On every rung, checks at a trust boundary, failure handling that keeps data from being lost, anything security depends on, accessibility and anything you asked for by name are built completely.

## Settings

exo reads each setting from four layers, highest first: `.claude/exo.local.json` (this machine, git-ignored), `.claude/exo.json` (the repository, committed so every collaborator shares it), the plugin's global options, then the default. The global options are asked when the plugin is enabled and change later in `/config`; `/exo:settings` shows every value with its layer and writes the two repository files.

| Key | Values | Default | Effect |
|---|---|---|---|
| `specs` | `docs`, `issues`, `both` | `docs` | Where `shaping` stores a spec: `docs/specs/`, a GitHub issue marked as shaped, or both. Without git, a GitHub remote or a signed-in `gh`, it writes the file. |

A new setting is one entry in `skills/settings/schema.json` plus the matching `userConfig` entry in `.claude-plugin/plugin.json`; `tests/settings.test.mjs` holds the two together.

## Savings

The `Stop` hook books every turn's API usage into a ledger at `~/.claude/exo/savings/sessions.json`. The read guard, a hook pair on `Read`, refuses an unbounded read of a file over 400 lines and a repeat read of an unchanged range, and books the bytes it kept out. `/exo:savings` prints one panel over every session: refusals, bytes withheld, and the calls, tokens, price and time exo's own work took.

One switch turns the ledger, the status line segment and the read guard off together:

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

The segment reads `exo 1.5 MB withheld · 2.4k tok · $0.04 · 2m`.

## Develop

```bash
npm install
npm run check            # the gate before any commit: verifier, self-test and script tests
claude --plugin-dir .    # run the working tree instead of the installed copy
```

`CONTRIBUTING.md` covers the checks, the evals, how skills dispatch delegates, and the hooks. `benchmarks/README.md` covers the paired runs that measure exo against a session without it.

A change lands under `## Unreleased` in the changelog without a version change, so the installed plugin updates only on a release. A release raises the version with `npm run bump`, tags `v<version>`, and publishes a GitHub Release whose notes `npm run release-notes` renders from the changelog: highlights, then Added, Changed, Fixed and Removed, then the upgrade commands. `CLAUDE.md` lists the steps.

## Credits

exo was inspired by [ponytail](https://github.com/dietrichgebert/ponytail), [caveman](https://github.com/juliusbrussee/caveman), [superpowers](https://github.com/obra/superpowers), [impeccable](https://github.com/pbakaus/impeccable), [Matt Pocock's skills](https://github.com/mattpocock/skills) and [smallest-complete](https://github.com/JetXu-LLM/smallest-complete).

## License

[PolyForm Noncommercial 1.0.0](LICENSE): use it, change it and share it for any noncommercial purpose.
