# exo

[![quality](https://github.com/blauwtje/exo/actions/workflows/quality.yml/badge.svg)](https://github.com/blauwtje/exo/actions/workflows/quality.yml)

One engineering process for Claude Code, as a plugin: skills that take turns, and prompts that keep discovery and builds off the main context.

## Install

```text
/plugin marketplace add blauwtje/exo
/plugin install exo@blauwtje
```

Restart Claude Code. The `using-exo` skill is injected at every session start, resume, clear and compaction; every other skill is invoked as `exo:<name>`.

## Skills

| Skill | Fires when | Invocation | Argument hint | Model | Effort |
|---|---|---|---|---|---|
| `shaping` | An outcome or feature request has no chosen solution. | model or slash | `<outcome to shape>` | session | session |
| `planning` | A plan is requested, a planning mode is active, or another executor runs the work. | model or slash | `<what to plan, or a spec path>` | session | session |
| `implementing` | A plan is run or resumed: one delegated build and one commit per task, then one branch review on `opus`. | model or slash | `[plan path]` | session | `high` |
| `implementing-batch` | A decided change builds in the session: more than two files, a dependency, a public signature, a persisted format or security boundary. | model or slash | `<decided change or plan path>` | session | session |
| `debug` | Existing behavior fails and the cause is unproven. | model or slash | `<symptom, failing command or error>` | session | session |
| `savings` | The user asks what exo cost or what the read guard withheld, or switches savings off or on: prints the ledger panel. | model or slash | `[report, on, off or status]` | `haiku` | session |
| `deepen` | The user asks where to improve architecture without naming the change. | model or slash | `[path, module or pain point]` | session | session |
| `research` | A decision hinges on a pinned external version's behavior. | model or slash | `<library, version and question>` | session | `high` |
| `designing` | A visual surface is created or changed. | model or slash | `<page, component or visual change>` | session | `high` |
| `issuing` | The user files issues as specs. | slash only | `<what the issue or issues should cover>` | `opus` | `high` |
| `ship-issue` | The user takes one issue to merged, one stage per call. | slash only | `<number, #number, issue URL, title, or what the issue is about>` | session | session |
| `merge-prs` | The user merges open pull requests behind API gates. | slash only | `[pull request numbers]` | session | session |
| `skills-tool` | A skill or agent is created, edited or judged too long. | model or slash | `<skill or agent to create, edit or size>` | session | session |
| `using-exo` | Session start; explains the rest. | injected by the session hook | none | session | session |

A skill whose work leaves the machine (issues, pull requests, merges) is slash-only with `disable-model-invocation: true`; every other skill stays model-invocable, so a next-stage question can start it, and its description opens with `Use when`. `model` and `effort` are set only where the skill's work always needs that tier, so the session's choice holds everywhere else. The stage skills pin no model, because the next-stage question names one per stage and a pinned model would override that pick and rebuild the prompt cache mid-session.

## Delegates and the hooks

The plugin ships no agent files. Every delegate is the harness's `general-purpose` agent: the dispatching skill names the model on each call (`sonnet` for a mechanical build or a documentation read; `opus` for debugging, plan repair, the design critique and the branch review; `sonnet` for codebase discovery, because locating files and symbols is mechanical) and hands it the role text from a `<role>-prompt.md` beside the skill, the way `obra/superpowers` does. Effort cannot travel with a dispatch, so `implementing`, `designing`, `research` and `issuing` pin `effort: high` in their own frontmatter, which their delegates inherit. `hooks/hooks.json` wires four hook groups: a SessionStart hook on startup, resume, clear and compaction that writes the plugin-root pointer, makes the read guard forget its reads after a clear or compaction, and hands the model the `using-exo` body, because a skill body is read only when invoked and that one says when to invoke the others and carries the right-sizing ladder; a PreToolUse and a PostToolUse hook on Read for the read guard below; and a Stop hook that records the turn's API usage into the savings ledger. The session hook needs `bash` and `jq` on `PATH`: without `jq` it still writes the pointer but injects no `using-exo` body, and says so on stderr. The Node hooks need `node`: without it every Read hook fails and the read goes through unguarded. The plugin ships no permission guard: a guard that caps what a machine may do belongs in that machine's own configuration, not in a shared plugin.

## The ladder

The ladder lives in the `using-exo` body, so the session hook puts it and its guards in every session's context, on or off the savings switch: it holds before every edit that adds or replaces code, and answers an explicit ask for the minimal or lean version. No skill call brings it. The four delegate prompts that write code (`skills/implementing/implementer-prompt.md`, `skills/implementing/bug-fixer-prompt.md`, `skills/implementing/branch-reviewer-prompt.md`, `skills/designing/builder-prompt.md`) carry it in their own text, because a delegate never sees the session hook. The model reads the ranges the change touches and follows the real flow, then stops at the first rung that holds:

```text
1. Need?              → a use imagined for later is skipped (YAGNI)
2. Present?           → reuse what this repository already has
3. Standard library?  → call it
4. Platform?          → use the native feature
5. Installed?         → use the dependency; add none for what ten lines cover
6. Minimum            → the fewest statements that pass, one thing per line
```

Trust-boundary validation, error handling that prevents data loss, security, accessibility and anything asked for by name are never on the ladder. Rung 6 sizes statements, not lines: readability and structure of code, files and folders outrank a shorter diff.

## Savings counter

`skills/savings/scripts/savings.mjs` keeps a ledger at `~/.claude/exo/savings/sessions.json` (under `CLAUDE_CONFIG_DIR` when set; `EXO_SAVINGS_DIR`, when set, outranks both): per session the usage the API reported for every call, by message id and model, the calls that were exo's own work, and the read guard's refusals and run time. The panel weights tokens by one fixed cache weighting, shared with the benchmark scorer (input + 0.1 × cache read + 1.25 × 5-minute cache write + 2 × 1-hour cache write + output, in `skills/savings/scripts/token-weights.mjs`); its cost row prices every call it counts at the API list price of its own model in `skills/savings/scripts/prices.mjs`, delegates at their own rate, so each model's own cache rates apply; on a subscription that is what those tokens would cost on the API, not the bill. The Stop hook feeds it every turn by reading only the transcript lines appended since the last turn; the ledger is updated behind a lock and sessions untouched for thirty days are pruned.

Every figure the panel prints is one the harness reported. `skills/savings/scripts/overhead.mjs` books, from the transcript, the API calls that were exo's own work, which are the calls whose every tool call loads an exo skill or re-issues a Read the guard refused: their usage as the API returned it, priced per model, and the wall time between the entry before the call and its last line, plus the duration the harness reports for exo's hook runs. The read guard books the bytes each refusal kept out of context. Nothing is multiplied by a benchmark ratio and nothing is derived from a character count, so the panel reports what exo cost and what it held back, never what the same work would have cost without exo: a session runs once, and its no-exo arm does not exist. `benchmarks/` measures that counterfactual separately, over paired runs, and records the cut it found in `benchmarks/results/<date>.md`. A model missing from `prices.mjs` makes the cost row `-`, never a guess.

The read guard (`skills/savings/scripts/read-guard.mjs`, a PreToolUse hook on Read that decides and a PostToolUse hook on Read that books the read once it succeeded) refuses an unbounded read of a file over 400 lines with a reason that asks for a located range, and refuses a second read of a range that is unchanged since the first in this context window; a clear or a compaction forgets the reads. Each capped refusal books, under its tool call, the bytes of the whole file, less what the same reader reads of that file afterwards in the same context window; a duplicate refusal books the bytes of the earlier read; each run books its own time.

One switch turns the counter, the status line segment and the read guard off together, the ladder excepted, which rides in every session either way: `node "$(cat ~/.claude/exo/plugin-root)/skills/savings/scripts/savings.mjs" off` (or `on`, `status`), which writes `"enabled": false` into `~/.claude/exo/savings/config.json`; `EXO_SAVINGS=off` or `EXO_SAVINGS=on` in the environment outranks the file. `"readGuard": false` in the same file switches the guard alone. There are no levels.

To show the running total in the status line, add to your `statusLine` command script, after it has read stdin into `$input`:

```bash
plugin_root_file="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/exo/plugin-root"
if [ -f "$plugin_root_file" ]; then
  savings=$(printf '%s' "$input" | node "$(cat "$plugin_root_file")/skills/savings/scripts/savings.mjs" statusline 2>/dev/null)
  [ -n "$savings" ] && printf ' · %s' "$savings"
fi
```

The segment reads `exo 1.5 MB withheld · 2.4k tok · $0.04 · 2m`. The full panel is a fixed-width grid under the switch state, relayed inside the `text` fence the script prints because its columns line up only in a monospace block: every session in the ledger at once, whatever project it ran in, with the guard's refusals and the bytes they withheld, and the calls, tokens, price and time exo's own work took. No bar, trend, streak or headline figure. `/exo:savings`, or `node "$(cat ~/.claude/exo/plugin-root)/skills/savings/scripts/savings.mjs" report`.

## Develop

Clone it anywhere you keep projects. An installed plugin runs from the cache copy, so an edit is live only after the release route `CLAUDE.md` names; for a live tree start `claude --plugin-dir <your clone>`. Every skill edit follows the `skills-tool` skill.

## Verify

```bash
npm run check          # the gate: verifier, its self-test, and the script tests
npm run validate       # the 12 structural checks over the skill corpus
npm test               # the script, hook, benchmark and eval-layout tests under tests/
npm run smoke          # a real session lists the exo: skills; calls a model
claude plugin validate .
```

Node 22 or newer, plus `bash` and `jq` on `PATH`. Nothing to install: every check runs on the Node standard library. CI runs `npm run check` on Node 22 and 24 for every push to main and every pull request.

`verify/budgets.mjs` names the skills the full verifier checks; every other skill still passes the frontmatter, portable-language and description-budget checks. `docs/` is git-ignored: research notes live outside this repository. `evals/` is tracked: a case is `evals/<skill>-<case>/prompt.md` with its graders beside it, the layout `tests/evals.test.mjs` checks. Its `name:` equals the directory name because `claude plugin eval . --case <glob>` filters on `name:`, not on the directory, and a glob that matches no case still exits 0: check the case count in the output before reading a green run.

`benchmarks/` measures exo against a no-skill baseline the way ponytail's agentic benchmark does: `node benchmarks/run.mjs --smoke` runs one template task and one safe task through every arm (baseline, terse-prose control, "YAGNI + one-liners" prompt, exo) as headless `claude -p --output-format json` cells on a fresh checkout of `tiangolo/full-stack-fastapi-template@cd83fc1`, with `--setting-sources project,local` keeping your own plugins out and `--plugin-dir` loading exactly one. `--model` sets the model every cell runs on, `haiku` by default. `node benchmarks/run.mjs --full` prints a cost projection from the last smoke run and stops; `--confirm` runs all 17 tasks at n=4. `node benchmarks/run.mjs --tasks calib-reply --arms baseline,exo --runs 6 --concurrency 1` runs the calibration cells. Raw cells go to `benchmarks/runs/<date>-<mode>/` (git-ignored, one `result.json`, `checks.json` and `usage.json` per cell; `usage.json` sums every transcript of the cell, subagents included, because the result's usage block holds the main thread only, and `node benchmarks/backfill-usage.mjs <run>` writes it for older cells while their transcripts survive); `node benchmarks/score.mjs benchmarks/runs/<dir>` rescores offline and prints one table, and `--publish` writes `benchmarks/results/<date>.md`, or the file `--results <file>` names, with the cut it measured per metric and that cut's standard error. No panel reads that file: the ledger reports measured figures only. Every safe check fails against its seed and passes against its reference solution under `npm test`.

## License

PolyForm Noncommercial 1.0.0: use and change it freely, sell it never. See `LICENSE`.
