# exo

[![quality](https://github.com/blauwtje/exo/actions/workflows/quality.yml/badge.svg)](https://github.com/blauwtje/exo/actions/workflows/quality.yml)

One engineering process for Claude Code, as a plugin: skills that take turns, and agents that keep discovery off the main context.

## Install

```text
/plugin marketplace add blauwtje/exo
/plugin install exo@blauwtje
```

Restart Claude Code. The `using-exo` skill is injected at every session start, clear and compaction; every other skill is invoked as `exo:<name>`.

## Skills

| Skill | Fires when |
|---|---|
| `shaping` | An outcome or feature request has no chosen solution. |
| `planning` | A plan is requested, a planning mode is active, or another executor runs the work. |
| `implementing` | A plan is run or resumed: one delegated build and two reviews per task, a commit each. |
| `implementing-batch` | A decided change builds in the session: more than one file, a dependency, a signature or tests. |
| `debug` | Existing behavior fails and the cause is unproven. |
| `right-sizing` | Code is about to be written: the smallest readable shape, stdlib and platform before a dependency, guards never cut. |
| `savings` | The user asks what the ladder and the read guard saved: prints the ledger table, user-invoked. |
| `deepen` | The user asks where to improve architecture without naming the change. |
| `research` | A decision hinges on a pinned external version's behavior. |
| `designing` | A visual surface is created or changed. |
| `issuing`, `ship-issue`, `merge-prs` | GitHub issue and pull-request workflows, user-invoked. |
| `skills-tool` | A skill or agent is created, edited or judged too long. |
| `using-exo` | Session start; explains the rest. |

## Agents and the hooks

`agents/` holds the delegates the skills dispatch, each pinned to the cheapest model and the narrowest tool list its job allows. `hooks/hooks.json` wires the hooks: a SessionStart injection that hands the model the `using-exo` body, because a skill body is read only when invoked and that one says when to invoke the others; and a Stop hook that records the turn's tokens and edited lines into the savings ledger. The session hook needs `bash` and `jq` on `PATH`; the Node hooks need `node`. The plugin ships no permission guard: a guard that caps what a machine may do belongs in that machine's own configuration, not in a shared plugin.

## Savings counter

`skills/savings/scripts/savings.mjs` keeps a ledger at `~/.claude/exo/savings/sessions.json` (under `CLAUDE_CONFIG_DIR` when set): per session the lines added and removed, the tokens weighted by cache price (input + 0.1 × cache read + 1.25 × 5-minute cache write + 2 × 1-hour cache write + output), and, when the status line segment is wired, the cost and duration the harness reports. The Stop hook feeds it every turn by reading only the transcript lines appended since the last turn, so the cost per turn is one small file write.

Two saving figures, kept apart: the read guard's is measured (the bytes it withheld, shown as tokens at four bytes each); the ladder's is an estimate, for sessions in which `right-sizing` fired, actual × r / (1 − r) with the ratios the ponytail agentic benchmark measured (LOC 0.54, tokens 0.22, cost 0.20, time 0.27), editable in `~/.claude/exo/savings/config.json`. The counterfactual behind the estimate is never measured; the label says so.

The read guard (`skills/savings/scripts/read-guard.mjs`, a PreToolUse hook on Read) is always on. It refuses an unbounded read of a file over 400 lines with a reason that asks for a located range, and refuses a second read of a range that is unchanged since the first in this context window; a clear or a compaction forgets the reads. Each refusal books the bytes withheld into the ledger. `"readGuard": false` in `~/.claude/exo/savings/config.json` is the only switch; there is no level and no command.

To show the running total in the status line, add to your `statusLine` command script, after it has read stdin into `$input`:

```bash
plugin_root_file="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/exo/plugin-root"
if [ -f "$plugin_root_file" ]; then
  savings=$(printf '%s' "$input" | node "$(cat "$plugin_root_file")/skills/savings/scripts/savings.mjs" statusline 2>/dev/null)
  [ -n "$savings" ] && printf ' · %s' "$savings"
fi
```

The segment reads `saved ≈ 1.2k LOC · 340k tok · $12.10 · 1h05 · guard ≈ 23k tok`. The full table: `/exo:savings`, or `node "$(cat ~/.claude/exo/plugin-root)/skills/savings/scripts/savings.mjs" report`.

## Develop

Clone it anywhere you keep projects. An installed plugin runs from the cache copy, so an edit is live only after `claude plugin update exo@blauwtje`; for a live tree start `claude --plugin-dir <your clone>`. Every skill edit follows the `skills-tool` skill.

## Verify

```bash
npm run check          # the gate: verifier, its self-test, and the script tests
npm run validate       # the 12 structural checks over the skill corpus
npm test               # the scripts under skills/designing/scripts/
npm run smoke          # a real session lists the exo: skills; calls a model
claude plugin validate .
```

Node 22 or newer, plus `bash` and `jq` on `PATH`. Nothing to install: every check runs on the Node standard library. CI runs `npm run check` on Node 22 and 24 for every pull request.

`verify/budgets.mjs` names the skills the verifier checks, so a new skill is unverified until it is listed there. `docs/` is git-ignored: research notes live outside this repository. `evals/` is tracked: a case is `evals/<skill>-<case>/prompt.md` with its graders beside it, the layout `tests/evals.test.mjs` checks.

## License

PolyForm Noncommercial 1.0.0: use and change it freely, sell it never. See `LICENSE`.
