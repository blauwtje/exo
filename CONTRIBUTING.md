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

## Evals

`evals/` is tracked. A case is `evals/<skill>-<case>/prompt.md` with its graders beside it; `tests/evals.test.mjs` checks that layout. The case's `name:` equals its directory name because `claude plugin eval . --case <glob>` filters on `name:`, not on the directory. A glob that matches no case still exits 0, so check the case count in the output before trusting a green run.

`docs/` is git-ignored: research notes, specs and plans live outside the repository.

## Benchmarks

`benchmarks/README.md` covers the paired headless runs that measure exo against a session without it.

## How a skill dispatches work

- The plugin ships no agent files. Every delegate is the harness's `general-purpose` agent; the dispatching skill names the model on each call and hands it the role text from a `<role>-prompt.md` beside the skill. `sonnet` runs a mechanical build, a documentation read and codebase discovery; `opus` runs debugging, plan repair, the design critique and the branch review.
- `CLAUDE_CODE_SUBAGENT_MODEL` outranks the named model on Claude Code before 2.1.251.
- Effort does not travel with a dispatch: a delegate runs at the effort of the turn that dispatched it. `implementing`, `designing`, `research` and `issuing` pin `effort: high` in their frontmatter, which raises the turn and its delegates only when the skill starts from its slash command. A skill the model starts mid-turn keeps the session's effort, which is why the next-stage question names the effort to set.
- The stage skills pin no model. The next-stage question names one per stage, and a pinned model would override that pick and rebuild the prompt cache mid-session. `model` and `effort` are set only where a skill's work always needs that tier.
- A delegate never sees the session hook, so the four delegate prompts that write code carry the right-sizing ladder in their own text: `skills/implementing/implementer-prompt.md`, `skills/implementing/bug-fixer-prompt.md`, `skills/implementing/branch-reviewer-prompt.md` and `skills/designing/builder-prompt.md`.

## Hooks

`hooks/hooks.json` wires four hook groups:

- **SessionStart**, on startup, resume, clear and compaction. It writes the plugin-root pointer to `~/.claude/exo/plugin-root` (under `CLAUDE_CONFIG_DIR` when set), makes the read guard forget its reads after a clear or compaction, and injects the `using-exo` body, because a skill body is read only when invoked and that one says when to invoke the others. Without `jq` it still writes the pointer but injects no body, and says so on stderr.
- **PreToolUse** and **PostToolUse** on `Read`: the read guard, in `skills/savings/scripts/read-guard.mjs`. Without `node` the hook fails and the read goes through unguarded.
- **Stop**: books the turn's API usage into the savings ledger.

The hook entry pins `"shell": "bash"` so a Windows host without Git Bash does not fall back to PowerShell, and `.gitattributes` forces LF so the shebang survives a Windows checkout. The plugin ships no permission guard: a cap on what a machine may do belongs in that machine's own configuration.

## Savings ledger internals

- The ledger lives at `~/.claude/exo/savings/sessions.json`, under `CLAUDE_CONFIG_DIR` when set; `EXO_SAVINGS_DIR` outranks both. Per session it holds the usage the API reported for every call, by message id and model, the calls that were exo's own work, and the read guard's refusals and run time.
- The `Stop` hook reads only the transcript lines appended since the last turn. Updates run behind a lock, and sessions untouched for thirty days are pruned.
- Tokens are weighted once, in `skills/savings/scripts/token-weights.mjs`, shared with the benchmark scorer. The cost row prices each call at the API list price of its own model from `skills/savings/scripts/prices.mjs`; a model missing there makes the row `-`, never a guess. On a subscription the figure is what those tokens would cost on the API, not the bill.
- `skills/savings/scripts/overhead.mjs` books the calls that were exo's own work: the calls whose every tool call loads an exo skill or re-issues a Read the guard refused, at the usage the API returned and the wall time the transcript shows, plus the duration the harness reports for exo's hook runs.
- Nothing is multiplied by a benchmark ratio and nothing is derived from a character count. The panel reports what exo cost and what it held back, never what the same work would have cost without exo; `benchmarks/` measures that counterfactual separately.
- The read guard refuses an unbounded read of a file over 400 lines with a reason that asks for a located range, and a second read of a range unchanged since the first in this context window. A capped refusal books the bytes of the whole file, less what the same reader reads of it afterwards in the same window; a duplicate refusal books the bytes of the earlier read.
- `~/.claude/exo/savings/config.json` holds the switches: `"enabled": false` turns the ledger, the status line segment and the read guard off together, and `"readGuard": false` turns the guard off alone. `EXO_SAVINGS=off` or `EXO_SAVINGS=on` in the environment outranks the file. The ladder is never switched off: it rides in every session.

## Releasing

`CLAUDE.md` names the release route. In short: `npm run check`, `npm run bump`, one Conventional Commit on `main`, push, then update the marketplace and reinstall the plugin. The marketplace compares only the manifest version, so an unbumped release installs as a no-op.
