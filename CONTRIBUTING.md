# Contributing

## Set up

Clone the repository anywhere you keep projects and run `npm install` once. The verifier and the tests run on the Node standard library. You need Node 22 or newer, plus `bash` and `jq` on `PATH`.

An installed plugin runs from Claude Code's cache copy, so an edit is live only after a release. To run the working tree instead, start Claude Code with `claude --plugin-dir <your clone>`.

## Checks

| Command | What it runs |
|---|---|
| `npm run check` | The gate before any commit: the verifier, its self-test and the script tests. |
| `npm run validate` | The structural checks over the skill corpus. |
| `npm test` | The script, hook and benchmark tests under `tests/`. |
| `npm run smoke` | A real session that lists the `exo:` skills. It calls a model. |
| `claude plugin validate .` | The harness's own manifest check. |
| `node verify/skill-graph.mjs <command> [args]` | A read-only index over the skills, agents, hooks, root docs, `verify/` and `tests/`: `size`, `range`, `inbound`, `pins`, `refs`, `overlap` and `json`, each printing a compact answer instead of a whole file. |

CI runs `npm run check` on Node 22 and 24 for every push to `main` and every pull request.

The `derivation` check fails the build when a name exo does not own reaches a shipped file, and when a third-party notice file appears at the repository root. `LICENSE` is the whole licence. The names are held base64-encoded inside `verify/checks/derivation.mjs`, because a plaintext list would be the text the check forbids.

`npm test` prints Node's spec reporter, which marks a failure with `✖`. `npm run check` runs the same tests through the TAP reporter, so its failure line names each failing test as `not ok`.

## Editing a skill

Load the `skills-tool` skill before any skill or delegate-prompt edit; it holds the shape and size rules the verifier enforces. `verify/budgets.mjs` names the skills the full verifier checks. Every other skill still passes the frontmatter, portable-language, description-budget, body-budget and reference-shape checks, so add a skill there once it reaches that shape.

A skill whose work leaves the machine, a push, a pull request, a merge or an issue, runs only on the authorization its body names: the user's pick of a finish route or a plain request. It never deletes a branch or cuts a release. `handoff` and `memory` alone carry `disable-model-invocation: true`, because they write a record only the user should approve; every other skill stays model-invocable so a next-stage answer can start it, and its description opens with `Use when`.

`ABOUT.md` at the repository root says what exo is and holds exo's domain words with the synonym each one replaces. A skill body, a reply and a commit use the left column; the `derivation` check reads the file for names exo does not own.

`skills/drafts/` stages a skill that is written but not loaded. A plugin loader discovers `skills/<name>/SKILL.md` only and does not recurse, so a skill nested there is listed nowhere, invoked by nobody and counted in no budget; `verify/repository.mjs` skips the folder for the same reason. Promotion means all five of: the folder moves to `skills/<name>/`, the name joins `EXPECTED_SKILLS` in `verify/budgets.mjs`, it gets a reference contract in `verify/checks/reference-tables.mjs`, its description is paid for in `DESCRIPTION_TOTAL_LOCK` and `DESCRIPTION_TOTAL_WARN`, and it gets a page under `docs/skills/`. A skill is written from a discipline that has been read, never from a one-line description.

A `SKILL.md` body after its frontmatter stays within `SKILL_BODY_TOKENS.ceiling` in `verify/budgets.mjs`, `INJECTED_BODY_TOKENS` for `using-exo`, at bytes / `BYTES_PER_TOKEN`; the `skill body budgets` check enforces it, because a body is paid for on every run of its skill, so bulk lives in `references/` and the body names the step that opens it. A reference longer than `REFERENCE_CONTENTS_LINES` opens with a contents list linking each `##` section and names no other reference, which the `reference shape` check enforces; `PENDING_TRIM` lists the skills not yet trimmed to these. A skill is split into two only when the halves fire at different moments, because a second skill adds its trigger to every session's listing.

## Adding a setting

A new setting is one entry in `skills/settings/schema.json` plus the matching `userConfig` entry in `.claude-plugin/plugin.json`; `tests/settings.test.mjs` holds the two together.

`docs/` is git-ignored: research notes, specs and plans live outside the repository.

## Benchmarks

`benchmarks/README.md` covers the paired headless runs that measure exo against a session without it.

## How a skill dispatches work

- Six roles are plugin agents under `agents/`, because only an agent file pins effort, a tool list and a turn limit, and its body is the system prompt instead of text the session pastes into every dispatch: `exo:explorer` runs codebase discovery on `haiku`, `exo:implementer` builds one plan task on `sonnet` at `high` effort whatever the session's effort, and on `opus` when `implementing` names that model for a task with a `Design:` line, `exo:branch-reviewer` runs the branch review on `opus` at `medium` effort for a branch of at most five changed files and 200 changed lines and `exo:branch-reviewer-deep` runs it at `high` effort above either number, with one body that `tests/agents.test.mjs` keeps identical, `exo:design-critic` runs the post-build design critique on `opus` at `medium` effort with a 12-turn limit, and `exo:design-discovery` runs the Phase 1 discovery of a designing redesign on `sonnet` at `high` effort with a 30-turn limit. A role becomes an agent only when it has one task shape, so one effort, one tool list and one turn limit fit every dispatch; a dispatch that names a model overrides the agent's own, and the implementer's task fields still come from `skills/implementing/implementer-prompt.md`. Every other delegate is the harness's `general-purpose` agent; the dispatching skill names the model on each call and hands it the role text from a `<role>-prompt.md` beside the skill. An agent that takes everything from its dispatch sets `omitClaudeMd: true`, which needs Claude Code 2.1.271 or later, and carries the rule against deleting past a blocked state in its own body, because it loads no `CLAUDE.md`. `sonnet` runs a mechanical build and a documentation read; `opus` runs debugging and plan repair.
- `CLAUDE_CODE_SUBAGENT_MODEL` outranks the named model on Claude Code before 2.1.251.
- Effort does not travel with a dispatch: a delegate runs at the effort of the turn that dispatched it. `designing`, `research` and `issuing` pin `effort: high` and `implementing` pins `effort: medium` in their frontmatter, which sets the turn and its delegates only when the skill starts from its slash command. A skill the model starts mid-turn keeps the session's effort, which is why the next-stage question names the effort to set.
- The stage skills pin no model. The next-stage question names one per stage, and a pinned model would override that pick and rebuild the prompt cache mid-session. `model` and `effort` are set only where a skill's work always needs that tier.
- A delegate never sees the session hook, so the five delegate prompts and agents that write code carry the right-sizing ladder in their own text: `agents/implementer.md`, `skills/implementing/bug-fixer-prompt.md`, `agents/branch-reviewer.md`, `agents/branch-reviewer-deep.md` and `skills/designing/builder-prompt.md`.

## Hooks

`hooks/hooks.json` wires eight hook groups:

- **SessionStart**, on startup, resume, clear and compaction. It writes the plugin-root pointer to `~/.claude/exo/plugin-root` (under `CLAUDE_CONFIG_DIR` when set), makes the read guard forget its reads and the repeat guard forget its calls after a clear or compaction, and injects the `using-exo` body, because a skill body is read only when invoked and that one says when to invoke the others. Without `jq` it still writes the pointer but injects no body, and says so on stderr.
- **PreToolUse** and **PostToolUse** on `Read`: the read guard, in `skills/savings/scripts/read-guard.mjs`. It hooks `Read` only and sees no file content read through Bash. Without `node` the hook fails and the read goes through unguarded.
- **PreToolUse** on `Bash` and `Edit`, and **PostToolUse** on `Edit` and `Write`: the repeat guard, in `skills/savings/scripts/repeat-guard.mjs`. Before the call it denies the third identical call in one context window and books the denial; after an `Edit` or `Write` succeeded it forgets that reader's `Bash` counts. Without `node` the call goes through unguarded.
- **UserPromptSubmit**: the restatement, in `skills/savings/scripts/restate.mjs`. Once the transcript has grown `RESTATE_INTERVAL_BYTES` (600,000) since the rules were last injected, the next prompt carries the sections `lib/restatement.mjs` names, cut out of `skills/using-exo/SKILL.md` at that moment, so no second copy of them exists. Every SessionStart moves the measuring point, `RESTATEMENT_LOCK` in `verify/budgets.mjs` locks the size, and `exo savings off` stops it, because the measuring point lives in the savings record. A fault exits 0 with nothing on stdout.
- **PostToolUse** on `TaskUpdate`: the context watch, in `skills/savings/scripts/context-watch.mjs`. When a task is marked completed in the main session, it reads the input, cache read and cache creation tokens of the transcript's last assistant turn and, past the `context` setting (thousands of tokens, 80 by default), adds one `exo: context <n>k tokens, past <threshold>k` line; under it, inside a delegate and on any fault it prints nothing.
- **UserPromptSubmit**: the memory nudge, in `skills/memory/scripts/nudge.mjs`. A prompt matching one of its correction markers gets one sentence naming the `memory.mjs book` command, and the fire is appended to `<git common dir>/exo/nudge-log.jsonl` with the marker that matched; `memory.mjs book` appends its own line there, so `node skills/memory/scripts/nudge.mjs stats --cwd .` prints the hit rate the marker list is tuned on, counting a booking only when a nudge in its session came first. The hook classifies nothing beyond the marker, so most fires are ignored by design, and `/exo:memory` books what the markers miss. A fault exits 0 with nothing on stdout.
- **PreToolUse** on `Bash`: the booking approval, `node skills/memory/scripts/nudge.mjs approve`. It returns `permissionDecision: "allow"` for the book command the nudge prints, so a booking shows no permission prompt and no user writes a rule naming an installed path that changes with every release. It allows only `node "<its own memory.mjs>" book` followed by `--claim`, `--quote` and `--session` with double-quoted values holding no double quote, dollar sign, backtick, backslash or line break, and prints nothing for any other command, which leaves that command to the user's rules and the prompt. A user's own deny or ask rule still wins over the approval, and a fault approves nothing.
- **Stop**: books the turn's API usage into the savings counter.

The hook entry pins `"shell": "bash"` so a Windows host without Git Bash does not fall back to PowerShell, and `.gitattributes` forces LF so the shebang survives a Windows checkout. The plugin ships no permission guard: a cap on what a machine may do belongs in that machine's own configuration. The booking approval caps nothing, because it allows one command of the plugin's own and leaves every other to that configuration.

## Savings counter internals

- The counter lives at `~/.claude/exo/savings/sessions.json`, under `CLAUDE_CONFIG_DIR` when set; `EXO_SAVINGS_DIR` outranks both. Per session it holds the usage the API reported for every call, by message id and model, the calls that were exo's own work, and the read guard's refusals and run time.
- The `Stop` hook reads only the transcript lines appended since the last turn. Updates run behind a lock, and sessions untouched for thirty days are pruned.
- Tokens are weighted once, in `skills/savings/scripts/token-weights.mjs`, shared with the benchmark scorer. Each cost prices a call at the API list price of its own model from `skills/savings/scripts/prices.mjs`; a model missing there prints `-`, never a guess. On a subscription the figure is what those tokens would cost on the API, not the bill.
- `skills/savings/scripts/overhead.mjs` books the calls that were exo's own work: the calls whose every tool call loads an exo skill or re-issues a Read the guard refused, at the usage the API returned and the wall time the transcript shows, plus the duration the harness reports for exo's hook runs. Each call books its kind, a skill load or a re-read after a capped or a duplicate refusal; the benchmark reads those figures, and the report prints none of them. Raising `OVERHEAD_VERSION` makes the next report read every stored transcript again; a row whose transcript is gone keeps its refusals and loses its cost figures.
- The report and the status line segment print one figure: the tokens the read guard kept out of context, estimated when they print from the `bytesWithheld` each refusal booked, at 3.5 characters per token, the ratio Anthropic documents, and split by big-file and repeated refusals. `sessions.json` stores no token figure, no cost, call, time or byte figure prints, and the report names itself an estimate. The repeat guard's denials and exo's own re-read cost stay out, because a denial carries no text to estimate from. `benchmarks/` measures what the same work costs without exo, separately.
- The read guard refuses an unbounded read of a file over `readGuardLines` lines, 400 unless set, with a reason that asks for a located range, and a second read of a range unchanged since the first in this context window. A capped refusal books the bytes of the whole file, less what the same reader reads of it afterwards in the same window; a duplicate refusal books the bytes of the earlier read. The guard hooks `Read` only: a file read through Bash, as `cat` or `sed` reads it, is neither refused nor booked.
- The repeat guard denies the third identical `Bash` command or `Edit` in one context window: identical is the command with its whitespace collapsed and its `.log` redirect dropped, or the file path with a hash of the text the edit replaces. A successful `Edit` or `Write` clears the `Bash` counts of the reader that made it, the main thread or one `agent_id`, so a red, green and final run of one test passes; a failed edit clears nothing, because `PostToolUse` runs only after the tool succeeded. Denials are booked under `guard.denials`, apart from the read guard's refusals, so the report's read counts keep their meaning; the report gains no line for them.
- `~/.claude/exo/savings/config.json` holds the switches: `"enabled": false` turns the counter, the status line segment and both guards off together, `"readGuard": false` turns the read guard off alone, `"repeatGuard": false` turns the repeat guard off alone, and `"readGuardLines"` sets the read guard's big-file limit, written by `savings.mjs guard-lines <lines>`; a value that is not a whole number of at least 1 reads as 400. `EXO_SAVINGS=off` or `EXO_SAVINGS=on` in the environment outranks the file. The ladder is never switched off: it rides in every session.

## Releasing

Merging to `main` releases. `.github/workflows/release.yml` asks `npm run release-pending` whether `## Unreleased` holds an entry; when it does, the job runs `npm run check`, `npm run bump`, commits `chore(release): <version>`, tags `v<version>`, pushes both and publishes the GitHub Release from `npm run release-notes`. A merge that records nothing under `## Unreleased` cuts no release and fails nothing.

So a pull request carries its changelog entry, and its `### Highlights` when the change deserves them, but never a version: the workflow reads the level off those sections. Its push carries `GITHUB_TOKEN`, which starts no further workflow run, so the release commit does not release itself. After the release lands, `claude plugin marketplace update blauwtje` and `claude plugin update exo@blauwtje` install it locally; the marketplace compares only the manifest version, so an unbumped release installs as a no-op.
