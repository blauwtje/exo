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

## The ladder

Before the first edit that adds or replaces code, `right-sizing` reads the ranges the change touches and follows the real flow, then stops at the first rung that holds:

```text
1. Does this need to exist?         → no: skip it (YAGNI)
2. Already in this codebase?        → reuse it, don't rewrite
3. Stdlib does it?                  → use it
4. Native platform feature?         → use it
5. Installed dependency?            → use it
6. Fewest readable statements?      → one thing per line, never a one-liner
7. Only then: the minimum that works
```

Trust-boundary validation, error handling that prevents data loss, security, accessibility and anything asked for by name are never on the ladder. Rung 6 sizes statements, not lines: readability and structure of code, files and folders outrank a shorter diff.

## Savings counter

`skills/savings/scripts/savings.mjs` keeps a ledger at `~/.claude/exo/savings/sessions.json` (under `CLAUDE_CONFIG_DIR` when set, or `EXO_SAVINGS_DIR` when set): per session the project root it started in (`CLAUDE_PROJECT_DIR` in the Stop hook, `workspace.project_dir` in the status line), the lines added and removed, the tokens weighted by cache price (input + 0.1 × cache read + 1.25 × 5-minute cache write + 2 × 1-hour cache write + output, in `skills/savings/scripts/token-weights.mjs`), and, when the status line segment is wired, the cost and duration the harness reports. Without that cost, a session is priced from its tokens at the API list prices per model in `skills/savings/scripts/prices.mjs`, delegates at their own model's rate; on a subscription that is what the same tokens would cost on the API, not the bill. The Stop hook feeds it every turn by reading only the transcript lines appended since the last turn; the ledger is updated behind a lock and sessions untouched for thirty days are pruned.

Two saving figures, labelled apart in the report: the read guard's is measured (the bytes it withheld, shown as tokens at four bytes each); the ladder's is an estimate, for sessions in which `right-sizing` fired, actual × r / (1 − r) with the ratios in `skills/savings/scripts/ratios.mjs`, which names its source and which `node benchmarks/score.mjs <run> --publish` rewrites from a measured run (see Benchmarks). The ratios are editable in `~/.claude/exo/savings/config.json`. The counterfactual behind the estimate is never measured; the report's `≈ saved` header says so.

The read guard (`skills/savings/scripts/read-guard.mjs`, a PreToolUse hook on Read that decides and a PostToolUse hook on Read that books the read once it succeeded) refuses an unbounded read of a file over 400 lines with a reason that asks for a located range, and refuses a second read of a range that is unchanged since the first in this context window; a clear or a compaction forgets the reads. Each refusal books the bytes withheld into the ledger.

One switch turns the ladder, the counter, the status line segment and the read guard off together: `node "$(cat ~/.claude/exo/plugin-root)/skills/savings/scripts/savings.mjs" off` (or `on`, `status`), which writes `"enabled": false` into `~/.claude/exo/savings/config.json`; `EXO_SAVINGS=off` or `EXO_SAVINGS=on` in the environment outranks the file. `"readGuard": false` in the same file switches the guard alone. There are no levels.

To show the running total in the status line, add to your `statusLine` command script, after it has read stdin into `$input`:

```bash
plugin_root_file="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/exo/plugin-root"
if [ -f "$plugin_root_file" ]; then
  savings=$(printf '%s' "$input" | node "$(cat "$plugin_root_file")/skills/savings/scripts/savings.mjs" statusline 2>/dev/null)
  [ -n "$savings" ] && printf ' · %s' "$savings"
fi
```

The segment reads `saved ≈ 1.2k LOC · 340k tok · $12.10 · 1h05 · guard ≈ 23k tok`. The full panel, markdown the model relays unfenced so Claude Code styles it, with the switch state, the saving in the current project beside all projects, and a 30-day trend of the cost saved per day for each: `/exo:savings`, or `node "$(cat ~/.claude/exo/plugin-root)/skills/savings/scripts/savings.mjs" report`.

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

`benchmarks/` measures exo against a no-skill baseline the way ponytail's agentic benchmark does: `node benchmarks/run.mjs --smoke` runs one template task and one safe task through every arm (baseline, terse-prose control, "YAGNI + one-liners" prompt, exo) as headless `claude -p --output-format json` cells on a fresh checkout of `tiangolo/full-stack-fastapi-template@cd83fc1`, with `--setting-sources project,local` keeping your own plugins out and `--plugin-dir` loading exactly one. `node benchmarks/run.mjs --full` prints a cost projection from the last smoke run and stops; `--confirm` runs all 17 tasks at n=4. Raw cells go to `benchmarks/runs/<date>-<mode>/` (git-ignored, one `result.json` and `checks.json` per cell); `node benchmarks/score.mjs benchmarks/runs/<dir>` rescores offline and prints one table, and `--publish` writes `benchmarks/results/<date>.md` and `skills/savings/scripts/ratios.mjs`. Every safe check fails against its seed and passes against its reference solution under `npm test`.

## License

PolyForm Noncommercial 1.0.0: use and change it freely, sell it never. See `LICENSE`.
