# Contributing

## Set up

Clone the repository and run `npm install` once. You need Node 22 or newer and `bash` on `PATH`; the verifier and tests use only the Node standard library.

A marketplace added from `blauwtje/exo` on GitHub installs a cache copy, so an edit there is live only after a release; `claude --plugin-dir <your clone>` runs the working tree instead. A marketplace added from a local directory whose `marketplace.json` sets `"source": "./"` (this checkout is one) loads the plugin in place, with no cache copy: an edit is live after `/reload-plugins`.

## Checks

| Command | What it runs |
|---|---|
| `npm run check` | The gate before any commit: the verifier, its self-test and the script tests. |
| `npm run validate` | The structural checks over the skill corpus. |
| `npm test` | The script, hook and benchmark tests under `tests/`. |
| `npm run smoke` | A real session that lists the `exo:` skills. It calls a model. |
| `claude plugin validate .` | The harness's own manifest check. |
| `npm run generate` | Writes `harnesses/codex/generated/` from the sources (see [Codex](#codex)). |
| `node install.mjs [--harness claude,codex] [--scope user\|project\|local] [--project <dir>] [--yes] [--update] [--remove]` | Installs exo into every detected harness from this clone, or updates or removes what it recorded. It generates in memory, so an install never uses a stale tree. |
| `node verify/skill-graph.mjs <command> [args]` | A read-only index over skills, agents, hooks, root docs, `verify/` and `tests/`: `size`, `range`, `inbound`, `pins`, `refs`, `overlap` and `json`, each printing a compact answer instead of a whole file. |

CI runs `npm run check` on Node 24 on Ubuntu for every push to `main` and every pull request.

`npm test` prints Node's spec reporter, which marks a failure with `✖`. `npm run check` runs the same tests through TAP, so its failure line names each failing test as `not ok`.

The `instruction density` check fails a list item of three or more sentences and a sentence over 40 words in the Markdown under `skills/`, `agents/` and `output-styles/`, outside fenced code, frontmatter, HTML comments, headings and tables; an inline code span counts as one word. `verify/instruction-density-allowlist.txt` names the offenders the tree held when the check began, and `INSTRUCTION_DENSITY_ALLOWLIST_LOCK` in `verify/budgets.mjs` caps its length. A line that no longer matches fails `npm test` until `node verify/instruction-density.mjs --prune` drops it; the command never adds a line and prints the new count to copy into the lock.

The `derivation` check fails when a name exo does not own reaches a shipped file, or a third-party notice file appears at the repository root. `LICENSE` is the whole licence. The names sit base64-encoded in `verify/checks/derivation.mjs`, because a plaintext list would be the text the check forbids.

## Editing a skill

Load the `edit-skills` skill before any skill or delegate-prompt edit; it holds the shape and size rules the verifier enforces. `verify/budgets.mjs` names the skills the full verifier checks; every other skill still passes the frontmatter, portable-language, description-budget, body-budget and reference-shape checks. Add a skill there once it reaches that shape.

A skill whose work leaves the machine (a push, pull request, merge or issue) runs only on the authorization its body names: the user's pick of a finish route or a plain request. The one exception is `ship` under `ship=ask`, which pushes a non-default branch to origin without asking; merge, default-branch push, pull request and issue still ask. It never deletes a branch or cuts a release.

Four skills carry `disable-model-invocation: true`, because only the user should start them: `start` and `route-skills` show the skills on request (the session hook already loads the routing rules); `save-session` and `remember` write a record only the user should approve. Every other skill stays model-invocable so a next-stage answer can start it, and its description opens with `Use when`.

`ABOUT.md` says what exo is and lists exo's domain words with the synonym each replaces. Skill bodies, replies and commits use the left column; the `derivation` check reads the file for names exo does not own.

A new skill needs all of: the folder `skills/<name>/`, its name in `EXPECTED_SKILLS` in `verify/budgets.mjs`, a reference contract in `verify/checks/reference-tables.mjs`, room for its description in `DESCRIPTION_TOTAL_LOCK` and `DESCRIPTION_TOTAL_WARN`, and a page under `docs/skills/`. Write a skill from a discipline you have read, never from a one-line description.

Rename a skill with `node skills/edit-skills/scripts/rename-skill.mjs --from <old> --to <new>`. It moves the skill folder, its `docs/skills/` page and its pressure folder, then rewrites every word-bounded mention outside `CHANGELOG.md` and `benchmarks/results/`.

A `SKILL.md` body after its frontmatter stays within `SKILL_BODY_TOKENS.ceiling` in `verify/budgets.mjs` (`INJECTED_BODY_TOKENS` for `route-skills`), counted as bytes / `BYTES_PER_TOKEN`, because a body is paid for on every run; bulk lives in `references/` and the body names the step that opens it. A reference longer than `REFERENCE_CONTENTS_LINES` opens with a contents list linking each `##` section, and no reference links to another. `PENDING_TRIM` lists the skills not yet trimmed to these. Split a skill in two only when the halves fire at different moments, because each skill adds its trigger to every session's listing.

## Adding a setting

A new setting is one entry in `skills/configure/schema.json` plus the matching `userConfig` entry in `.claude-plugin/plugin.json`; `tests/settings.test.mjs` keeps the two in step.

`docs/` is git-ignored: research notes, specs and plans live outside the repository.

## Benchmarks

`benchmarks/README.md` covers the paired headless runs that measure exo against a session without it.

## How a skill dispatches work

- Ten roles are plugin agents under `agents/`, because only an agent file pins effort, a tool list and a turn limit, and its body is the system prompt rather than text pasted into every dispatch. A role becomes an agent only when one effort, one tool list and one turn limit fit every dispatch. Each agent's description says what it does.
- `exo:review-branch` runs on the `review-deep` kind's model and effort, passed in the call, when a landed task carries a `Risk:` field, a manifest or lockfile changed or a public signature changed. It fixes nothing; on `FINDINGS`, `verify` hands its report to `exo:fix-review`, then runs the Final verification once.
- `lib/model-kinds.json` owns every model and effort: it maps each agent file to a task kind and each kind to a tier and an effort, so this page names neither. A kind's `tier` may be `inherit`, which omits the dispatch's `model` so the session's own model runs. A dispatch that names a model overrides the agent's own.
- The `budget` setting shifts the tier only, because the Agent tool takes no effort; its rules resolve models from the `budgets` data in that file. Codex ignores a call's model, so `codexTwins` has `npm run generate` write one agent file per budget twin. The `budget` schema's `aliases` (`full`, `normal`, `lean`) let `lib/settings-store.mjs` read an old stored name as the new one.
- Every other delegate is the harness's `general-purpose` agent; the dispatching skill names its model from `lib/model-kinds.json` and hands it the role text from a `<role>-prompt.md` beside the skill.
- An agent that takes everything from its dispatch sets `omitClaudeMd: true` (Claude Code 2.1.271 or later) and carries the rule against deleting past a blocked state in its own body, because it loads no `CLAUDE.md`.
- `CLAUDE_CODE_SUBAGENT_MODEL` outranks the named model on Claude Code before 2.1.251.
- Effort does not travel with a dispatch: a delegate runs at the effort of the turn that dispatched it. `design-ui`, `check-docs`, `file-issues` and `build` pin `effort` in their frontmatter, each value from `lib/model-kinds.json`, which takes effect only when the skill starts from its slash command. That is why the fresh-chat route ends on `/exo:build`.
- The stage skills pin no model: the fresh-chat route after `spec` names one, and a pinned model would override that pick and rebuild the prompt cache mid-session. Set `model` or `effort` in a skill only where its work always needs that tier.
- A delegate never sees the session hook, so the five delegate prompts and agents that write code point to `skills/route-skills/references/lean.md` or carry lines from it: `agents/build-task.md`, `skills/build/bug-fixer-prompt.md`, `skills/build/review-fixer-prompt.md`, `agents/build-ui.md` and `skills/find-cause/fixer-prompt.md`. The session's own pointer to `lean.md` is never switched off: it rides in every session.

## Unattended runs

`node skills/build/scripts/run-plan.mjs <plan.md>` lands a plan with no session open. Each unlanded task runs in a fresh `claude -p` process given `/exo:build <plan> --task <n>`, then one `/exo:verify` process and `verify.mjs` run. `--dry-run` runs the preflight and prints the task order, rules and first prompt without spawning; the script's header comment lists the other flags; `--max-iterations` defaults to twice the unlanded tasks, `--timeout` to 60 minutes per process, `--model` and `--effort` to `agents/build-task.md`.

- **Refusal**: `run-plan: refused: <why>`, exit 2, when the checkout is off the plan's `Branch:`, on the default branch, has a tracked change, or `plan-check --loop` fails (it needs `Allow:` in `## Plan basis`).
- **Permissions**: every process runs under `--permission-mode dontAsk`, allowed only `Read`, `Edit` and `Write` in the checkout, the runner's scripts and `lib/mcp-tool-call.mjs`, the plan's `Proof:`, `Run:`, `Land gate:`, `Lint:` and `Allow:` commands, and read-only git, and denied `git push`, `gh`, history rewrites, `git commit`, `settings.mjs` and `memory.mjs`, so `land-task.mjs` is the only committer. `EXO_RUN_TASK=<plan-id>/<n>` makes `land-task.mjs` refuse any other plan, task or `--fix`.
- **Breach check**: after each process HEAD holds no new commit, or one whose parent is the old HEAD and whose only `Plan-task` trailer names the task; no branch or `refs/remotes/*` ref may move.
- **Stop**: one `run-plan: stop: ` line (`done, <k>/<k> tasks landed, gate PASS|FAIL`, `iteration cap`, `no progress on task <n> in 2 iterations`, `task <n> blocked`, `breach in iteration <i>` or `exo not loaded`); only `done, <k>/<k> tasks landed, gate PASS` exits 0, every other stop exits 1. A command outside the allowlist is denied and logged in `summary.txt` as `Denied in iteration <i>, task <n>: <command>`, not a stop; the task is judged only by whether it landed, so a run of denials that lands nothing counts toward `no progress`. An interactive command stops the run at the timeout.
- **Logs**: `.exo/run-plan/<plan-id>/<UTC time>/`, one `iter-<k>-task-<n>.log` per process plus `tail.log` and `summary.txt`.

## Hooks

`hooks/hooks.json` registers four commands, one hook process per event and matcher rather than one per feature: `hooks/session-start.mjs` on `SessionStart`, `hooks/dispatch-prompt.mjs` on `UserPromptSubmit` (reply expander), `hooks/dispatch-bash.mjs` on `PreToolUse` for `Bash` (the five Bash guards, delegate budget and booking approval), and the delegate budget alone on every other tool. A dispatcher runs each step in its own try/catch, returns the first deny or block and joins the additional contexts. The writing guard has no `Edit|Write` entry, because it passes both.

- **SessionStart** (startup, resume, clear, compaction): writes the plugin-root pointer to `~/.claude/exo/plugin-root` (under `CLAUDE_CONFIG_DIR` when set), injects the `memory.mjs book` command with the session id so a session can book a user's correction of a repository fact in any language, and injects the `route-skills` body, because a skill body is read only when invoked and that one says when to invoke the others.
- **Delegate budget** (`hooks/guards/delegate-budget.mjs`): only inside a delegate, counts the last turn's tokens and the calls. Past the soft limit it adds an `exo budget: <n>k of <hard>k tokens used` line; past the hard limit it denies every tool except edits, writes, task updates and plain `git add`, `git commit`, `git status` or `git diff --stat`, and says to write the report. Limits live in `lib/delegate-budgets.json`, overridable per agent type; a `Budget: <soft>k/<hard>k` line in the dispatch outranks both. Any fault prints nothing.
- **Booking approval** (`skills/remember/scripts/approve-book.mjs`): allows only the exact `memory.mjs book` command the session hook prints, so a booking shows no permission prompt and no user writes a rule naming an installed path. It prints nothing for any other command; a user's own deny or ask rule still wins, and a fault approves nothing.

Each hook entry pins `"shell": "bash"` and `.gitattributes` forces LF; `CLAUDE.md` `## Environment` says why.

The plugin ships no permission guard: a cap on what a machine may do belongs in that machine's own configuration.

## Codex

`lib/model-kinds.json` stays the one table: `provider` stays `claude`, and its `providers.codex` block maps each tier to a Codex model and effort. `npm run generate` applies `harnesses/codex/rules.mjs` to the Claude sources and writes the committed `harnesses/codex/generated/` tree: each skill rewritten with its `agents/openai.yaml`, and `agents/exo-<agent>.toml` per agent and per `codexTwins` entry. Edit a source or the table, run `npm run generate`, commit the output; `npm run check` fails on a missing, differing or stray generated file.

`harnesses/codex/overrides/<path under generated>` replaces one generated file and opens with `<!-- exo:override source-sha256=<hash> -->`. Add one only after a skill reads wrong in a real Codex run; a changed source hash fails `npm run check`.

`install.mjs` runs one adapter per harness, listed in `harnesses/registry.mjs`. An adapter is `harnesses/<name>/adapter.mjs` exporting `name`, `label`, `detect(env)`, `install(plan)`, `update(record)`, `remove(record)` and `recorded(env)`; a new harness is one adapter folder plus one registry line. The Claude adapter runs `claude plugin install exo@blauwtje -s <scope>`; the Codex adapter copies the generated skills and agents and merges the allowlisted hook entries from `harnesses/codex/hooks.mjs`. Each records its installs in `installed.json` under its config home.

Codex hooks and generated script commands run through `harnesses/codex/hook-entry.mjs` and `harnesses/codex/run.mjs`, which set `EXO_HOST=codex`; `lib/host.mjs` treats a missing or unknown value as Claude Code. Try an install against a scratch folder with `HOME=<dir> CODEX_HOME=<dir>/.codex node install.mjs --harness codex --yes`.

## Releasing

Merging to `main` releases. `.github/workflows/release.yml` checks with `npm run release-pending` whether `## Unreleased` holds an entry; if so it runs `npm run check` and `npm run bump`, commits `chore(release): <version>`, tags `v<version>`, pushes both and publishes the GitHub Release from `npm run release-notes`. A merge with nothing under `## Unreleased` cuts no release.

A pull request carries its changelog entry, and `### Highlights` when deserved, but never a version: the workflow reads the level off those sections. The release push uses `GITHUB_TOKEN`, which starts no further workflow, so the release commit does not release itself. After a release, `claude plugin marketplace update blauwtje` and `claude plugin update exo@blauwtje` install it locally; the marketplace compares only the manifest version, so an unbumped release installs as a no-op.
