# Contributing

## Set up

Clone the repository anywhere you keep projects and run `npm install` once. The verifier itself runs on the Node standard library; the eval-layout test needs the `yaml` package. You need Node 22 or newer, plus `bash` and `jq` on `PATH`.

An installed plugin runs from Claude Code's cache copy, so an edit is live only after a release. To run the working tree instead, start Claude Code with `claude --plugin-dir <your clone>`.

## Checks

| Command | What it runs |
|---|---|
| `npm run check` | The gate before any commit: the verifier, its self-test and the script tests. |
| `npm run validate` | The structural checks over the skill corpus. |
| `npm test` | The script, hook, benchmark and eval-layout tests under `tests/`. |
| `npm run smoke` | A real session that lists the `exo:` skills. It calls a model. |
| `claude plugin validate .` | The harness's own manifest check. |

CI runs `npm run check` on Node 22 and 24 for every push to `main` and every pull request.

`npm test` prints Node's spec reporter, which marks a failure with `✖`. `npm run check` runs the same tests through the TAP reporter, so its failure line names each failing test as `not ok`.

## Editing a skill

Load the `skills-tool` skill before any skill or delegate-prompt edit; it holds the shape and size rules the verifier enforces. `verify/budgets.mjs` names the skills the full verifier checks. Every other skill still passes the frontmatter, portable-language and description-budget checks, so add a skill there once it reaches that shape.

A skill whose work leaves the machine (issues, pull requests, merges) is slash-only, with `disable-model-invocation: true`. Every other skill stays model-invocable so a next-stage answer can start it, and its description opens with `Use when`.

## Adding a setting

A new setting is one entry in `skills/settings/schema.json` plus the matching `userConfig` entry in `.claude-plugin/plugin.json`; `tests/settings.test.mjs` holds the two together.

## Evals

`evals/` is tracked. A case is `evals/<skill>-<case>/prompt.md` with its graders beside it; `tests/evals.test.mjs` checks that layout. The case's `name:` equals its directory name because `claude plugin eval . --case <glob>` filters on `name:`, not on the directory. A glob that matches no case still exits 0, so check the case count in the output before trusting a green run.

The runner's llm judges answer one word and keep no reasoning. `npm run eval-reasons [results-dir]` asks one more judge, on the run's judge model, to reason and then vote on every failed llm grader vote, writes `judge-reasons.json` beside `aggregate-result.json`, and prints each grader's pass rate per arm. A run without `--judge-model` records no judge model, and the file then names the runner default as its source, so runs judged by different models are not compared unawares.

### savings-report-reads-cold

This case is not part of `npm run check`: it calls a model for every run. Run it when the report text in `skills/savings/scripts/savings.mjs` or one of the case's graders changes. `eval-case.mjs` runs it with Sonnet as judge, splits the runs over several runner processes (the runner allows at most 8 in flight each), and by default starts every run at once.

| Command | Runs | Measured on 2026-09-17 |
|---|---|---|
| `npm run eval:savings-report:draft` | 3, no-plugin arm | 122 s, $1.00 |
| `npm run eval:savings-report` | 10, no-plugin arm | 130 s, $3.30 |
| `npm run eval:savings-report -- --arm both` | 10 per arm | 148 s, $7.12 |

The draft is for iterating on wording and is never a verdict: at 3 runs one answer moves a pass rate by a third. Take a verdict from the full run, and judge it on the no-plugin arm, the cold reader; the plugin arm still loads exo's hooks and skill list. Add `--arm both` only when `skills/savings/SKILL.md` or the session hook's text changes, because that text is all that differs between the arms. Every command writes its results under `evals/results/` and reasons only about failed votes.

`docs/` is git-ignored: research notes, specs and plans live outside the repository.

## Benchmarks

`benchmarks/README.md` covers the paired headless runs that measure exo against a session without it.

## How a skill dispatches work

- Three roles are plugin agents under `agents/`, because only an agent file pins effort, a tool list and a turn limit, and its body is the system prompt instead of text the session pastes into every dispatch: `exo:explorer` runs codebase discovery on `haiku`, `exo:branch-reviewer` runs the branch review on `opus` at `high` effort, and `exo:design-critic` runs the post-build design critique on `opus` at `high` effort with a 30-turn limit. A role becomes an agent only when it has one task shape, so one effort, one tool list and one turn limit fit every dispatch; the build delegate stays `general-purpose` because its tasks differ in model, tools and length. Every other delegate is the harness's `general-purpose` agent; the dispatching skill names the model on each call and hands it the role text from a `<role>-prompt.md` beside the skill. An agent that takes everything from its dispatch sets `omitClaudeMd: true`, which needs Claude Code 2.1.271 or later. `sonnet` runs a mechanical build and a documentation read; `opus` runs debugging and plan repair.
- `CLAUDE_CODE_SUBAGENT_MODEL` outranks the named model on Claude Code before 2.1.251.
- Effort does not travel with a dispatch: a delegate runs at the effort of the turn that dispatched it. `implementing`, `designing`, `research` and `issuing` pin `effort: high` in their frontmatter, which raises the turn and its delegates only when the skill starts from its slash command. A skill the model starts mid-turn keeps the session's effort, which is why the next-stage question names the effort to set.
- The stage skills pin no model. The next-stage question names one per stage, and a pinned model would override that pick and rebuild the prompt cache mid-session. `model` and `effort` are set only where a skill's work always needs that tier.
- A delegate never sees the session hook, so the four delegate prompts and agents that write code carry the right-sizing ladder in their own text: `skills/implementing/implementer-prompt.md`, `skills/implementing/bug-fixer-prompt.md`, `agents/branch-reviewer.md` and `skills/designing/builder-prompt.md`.

## Hooks

`hooks/hooks.json` wires four hook groups:

- **SessionStart**, on startup, resume, clear and compaction. It writes the plugin-root pointer to `~/.claude/exo/plugin-root` (under `CLAUDE_CONFIG_DIR` when set), makes the read guard forget its reads after a clear or compaction, and injects the `using-exo` body, because a skill body is read only when invoked and that one says when to invoke the others. Without `jq` it still writes the pointer but injects no body, and says so on stderr.
- **PreToolUse** and **PostToolUse** on `Read`: the read guard, in `skills/savings/scripts/read-guard.mjs`. Without `node` the hook fails and the read goes through unguarded.
- **Stop**: books the turn's API usage into the savings counter.

The hook entry pins `"shell": "bash"` so a Windows host without Git Bash does not fall back to PowerShell, and `.gitattributes` forces LF so the shebang survives a Windows checkout. The plugin ships no permission guard: a cap on what a machine may do belongs in that machine's own configuration.

## Savings counter internals

- The counter lives at `~/.claude/exo/savings/sessions.json`, under `CLAUDE_CONFIG_DIR` when set; `EXO_SAVINGS_DIR` outranks both. Per session it holds the usage the API reported for every call, by message id and model, the calls that were exo's own work, and the read guard's refusals and run time.
- The `Stop` hook reads only the transcript lines appended since the last turn. Updates run behind a lock, and sessions untouched for thirty days are pruned.
- Tokens are weighted once, in `skills/savings/scripts/token-weights.mjs`, shared with the benchmark scorer. Each cost prices a call at the API list price of its own model from `skills/savings/scripts/prices.mjs`; a model missing there prints `-`, never a guess. On a subscription the figure is what those tokens would cost on the API, not the bill.
- `skills/savings/scripts/overhead.mjs` books the calls that were exo's own work: the calls whose every tool call loads an exo skill or re-issues a Read the guard refused, at the usage the API returned and the wall time the transcript shows, plus the duration the harness reports for exo's hook runs. Each call books its kind, a skill load or a re-read after a capped or a duplicate refusal, so the report can set each guard's re-read cost beside what it held back. Raising `OVERHEAD_VERSION` makes the next report read every stored transcript again; a row whose transcript is gone keeps its refusals and loses its cost figures.
- Nothing is multiplied by a benchmark ratio and nothing is derived from a character count. The report leads with what exo cost, counts what the guard refused, and prints no saving and no net: refused text was never sent, so it has no token count or price. The token total appears once, in the footer, and never on a line or row with a cost. `benchmarks/` measures what the same work costs without exo, separately.
- The read guard refuses an unbounded read of a file over `readGuardLines` lines, 400 unless set, with a reason that asks for a located range, and a second read of a range unchanged since the first in this context window. A capped refusal books the bytes of the whole file, less what the same reader reads of it afterwards in the same window; a duplicate refusal books the bytes of the earlier read.
- `~/.claude/exo/savings/config.json` holds the switches: `"enabled": false` turns the counter, the status line segment and the read guard off together, `"readGuard": false` turns the guard off alone, and `"readGuardLines"` sets the guard's big-file limit, written by `savings.mjs guard-lines <lines>`; a value that is not a whole number of at least 1 reads as 400. `EXO_SAVINGS=off` or `EXO_SAVINGS=on` in the environment outranks the file. The ladder is never switched off: it rides in every session.

## Releasing

`CLAUDE.md` names the release route. In short: `npm run check`, `npm run bump`, one Conventional Commit on `main`, push, then update the marketplace and reinstall the plugin. The marketplace compares only the manifest version, so an unbumped release installs as a no-op.
