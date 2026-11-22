# Contributing

## Set up

Clone the repository. You need Node 22 or newer and `bash` on `PATH`; the verifier and tests use only the Node standard library.

A marketplace added from `blauwtje/exo` on GitHub installs a cache copy, so an edit there is live only after a release; `claude --plugin-dir <your clone>` runs the working tree instead. A marketplace added from a local directory whose `marketplace.json` sets `"source": "./"` (this checkout is one) loads the plugin in place, with no cache copy: an edit is live after `/reload-plugins`.

## Checks

### Gate

| Command | What it runs |
|---|---|
| `npm run check` | The gate before any commit: `node verify.mjs`, the static checks, the script tests and the plugin version check. It ends with `SUMMARY PASS=n FAIL=n WARN=n UNRUN=n`. |
| `npm run validate:static` | The static checks only: `claude plugin validate --strict`, skill frontmatter, local Markdown links, skill layout, JavaScript syntax, the hook set, principle page citations, silent catch blocks, invisible Unicode and personal paths. |
| `npm run validate` | `npm run validate:static` and then `npm test`. |

The skill layout check fails a skill body over 500 lines, a reference its skill body does not name, a reference that points to another reference, and a skill file that paths into another skill's folder. The hook set check fails a `hooks.json` beyond `SessionStart` and `UserPromptSubmit`, each with one command hook. The principle citations check fails a path after `exo:` in a principle page that does not exist. The silent catch check fails a script with more `catch {` blocks than its baseline. The invisible Unicode check fails a tracked file that holds a zero width, bidi control, soft hyphen, byte order mark or tag character, and skips a file with a NUL byte. The personal paths check fails a tracked file that holds a `/Users/`, `/home/` or drive `Users` path whose name is not a placeholder such as `user` or `you`. The plugin version check fails manifests that disagree on the version, and a branch that changes the tree with nothing under `## Unreleased` in `CHANGELOG.md`.

### Tests

| Command | What it runs |
|---|---|
| `npm test` | The script tests under `tests/`. |
| `claude plugin validate .` | The harness's own manifest check. |

CI runs `npm run check` on Node 22 and 24 on Ubuntu for every push to `main` and every pull request.

`npm test` prints Node's spec reporter, which marks a failure with `✖`. `npm run check` runs the same tests through TAP, so its failure line names each failing test as `not ok`. Both load `tests/clean-run-env.mjs` first, which strips the run variables `EXO_RUN`, `EXO_RUN_DIR`, `EXO_RUN_TASK` and `EXO_RUN_SESSION`. It also drops every `CLAUDE_PLUGIN_OPTION_*` variable and points `CLAUDE_PROJECT_DIR` at an empty folder, so no test reads the developer's exo settings.

## Editing a skill

Load the `author` skill before any skill or delegate-prompt edit; it holds the shape and size rules the verifier enforces.

A skill whose work leaves the machine (a push, pull request, merge or issue) runs only on the authorization its body names: the user's pick of a finish route or a plain request. The one exception is `ship` under `ship=ask`, which pushes a non-default branch to origin without asking; merge, default-branch push, pull request and issue still ask. It leaves every branch in place and cuts no release.

Every skill stays model-invocable, and its description names the words the user says, because a trigger on a fact nobody knows when the request arrives leaves the model to guess.

`ABOUT.md` says what exo is and lists exo's domain words with the synonym each replaces. Skill bodies, replies and commits use the left column.

A new skill needs the folder `skills/<name>/` and a page under `guide/`. Write a skill from a discipline you have read, not from a one-line description.

A skill body stays under 500 lines, because a body is paid for on every run; bulk lives in `references/` and the body names the step that opens it. No reference links to another. Split a skill in two only when the halves fire at different moments, because each skill adds its trigger to every session's listing.

A skill script parses its flags through `parseFlags` in `lib/script-flags.mjs`.

## Adding a setting

A new setting is one `userConfig` entry in `.claude-plugin/plugin.json`.

`docs/` is gitignored and holds only plans and research.

`principles/README.md` indexes first-party and community engineering principles; each page cites exo files after `exo:`. The index states the value rule.

## Evals

`claude plugin eval` runs the suite under `evals/` (a case is `evals/<case>/case.yaml` with its graders inline, or `evals/<case>/prompt.md` with `graders/`; a scaffolded case adds a one-line `scaffold.sh` that calls `evals/scaffold.sh`); `evals/results/` is gitignored. Run it only before a release: print the case count with `ls -d evals/*/ | grep -vc results`, run one case first with `EXO_ROOT="$PWD" claude plugin eval --case <case> --scaffold --allow-tools Bash Edit Write --json --judge-model sonnet --max-cost-usd 2`, then the suite with the same flags without `--case` and `--max-cost-usd` set to `BUDGET_USD` in `evals/value.mjs`, then once more with `--model <other model>` and record both settings in the scorecard's model and effort columns.

A case that passes gets one `criteria` grader; only a case that fails, is void or splits votes gets one grader per clause, as `evals/build-red-suite/case.yaml` does.

`evals/scorecard.md` lists the commands for each column and holds one table. Each release appends one row and no row is rewritten. `evals/failures.md` lists the failures seen in real sessions.

## How a skill dispatches work

- Two roles are plugin agents under `agents/`, `builder` and `researcher`, because an agent file fixes a tool list, a model, an effort and a turn limit, and its body is the system prompt rather than text pasted into every dispatch. The lead sends one fresh agent per separate job with file paths in the prompt, and runs jobs in parallel only when they share no file.
- An agent that takes everything from its dispatch sets `omitClaudeMd: true` (Claude Code 2.1.271 or later) and carries the rule against deleting past a blocked state in its own body, because it loads no `CLAUDE.md`.
- `CLAUDE_CODE_SUBAGENT_MODEL` outranks the named model on Claude Code before 2.1.251. `CLAUDE_CODE_EFFORT_LEVEL` overrides an agent's effort.
- A subagent takes its model and effort from its agent file's frontmatter; see each agent's and skill's frontmatter for the values, and a dispatch passes the Agent tool's `model` or `effort` only for a job in the Models table of `skills/build/SKILL.md`.
- A skill pins a model or effort only where its work always needs that tier, because a pinned model overrides the session's model and rebuilds the prompt cache mid-session; see each skill's frontmatter.

## Hook

- exo ships a `SessionStart` and a `UserPromptSubmit` hook in `hooks/hooks.json`. `corrections.mjs session-start` prints the `Exo found <n> new memories` line under the banner once per count and starts a recount; `corrections.mjs hook` runs on each prompt: it records each typed prompt, not one Claude Code starts itself, in a ledger keyed by `CLAUDE_PROJECT_DIR` (else the hook's `cwd`) by word overlap, with no phrase list of any language, and prints one `exo:` line, once per cluster, when a prompt repeats ones from at least 2 other sessions; the model judges whether it is a correction or wish. `corrections.mjs candidates` ranks clusters by sessions and a cluster needs 3 sessions and the model lists every one it judges a lesson; `keep` and `reject` record the user's answer by candidate id or by the id of an earlier verdict, and one reply settles the whole list; the hook flags a kept lesson that repeats once per keep. Lesson notes take Claude Code's auto-memory shape (frontmatter name, description, type; rule; Why; How to apply). It calls no model and no network. The hooks only detect and inject no rule per prompt: the xyrlan/mnemo README reports that per-prompt rule injection lifted rule-following from 41.0% to 72.1% yet prevented 0.005 repeats per session, because 62.5% of the corrected rules were already in CLAUDE.md or auto-memory, and a fixed block at session start did as well as per-prompt retrieval.

## Verifying in one round

A plan whose tasks all landed passes the end-of-run review in one round, because land catches what the review would catch late.

- **Tests at land**: after the Land gate passes, `land-task.mjs` runs the tests that read the task's changed files and refuses the land, naming the test, when one fails. `lib/covering-tests.mjs` finds them by scanning `tests/*.test.mjs` for a quoted path equal to a changed file or one of its ancestor folders, also with a leading `${...}` removed or a leading `./` or `../` resolved against `tests/`.
- **Slow gates**: `land-task.mjs` skips a Land gate whose last pass took 60 s or more, so the end of a `build` run runs the plan's `Land gate:` once.

## Timeout constants

| Constant | Value | File | Reason |
|---|---|---|---|
| `CHECK_TIMEOUT_MS` | 600000 | `lib/run-check.mjs` | a check gets 10 minutes before it counts as hung |
| `PROOF_TIMEOUT_MS` | 540000 | `skills/build/scripts/land-report.mjs` | a proof or gate stops 60 s before the 10-minute check limit |
| `BASE_RUN_ALLOWANCE_OVER_HEAD_MS` | 60000 | `lib/red-green.mjs` | the run at the base commit may take 60 s longer than the run at head, so a hung base run ends |
| `GATE_ONCE_PER_RUN_FROM_MS` | 60000 | `lib/check-cache.mjs` | a gate whose last pass took this long runs once per run, at the end |
| `LOCK_TIMEOUT_MS` | 900000 | `lib/land-lock.mjs` | a land waits 15 minutes for another land to finish |
| `POLL_MS` | 50 | `lib/land-lock.mjs` | how often a waiting land retries the lock |
| `WAIT_MS` | 1200000 | `skills/ship/scripts/ship.mjs` | `ship` waits 20 minutes for pull request checks, then exits 124 |
| `YTDLP_MS` | 120000 | `skills/watch/scripts/ytdlp.mjs` | one `yt-dlp` call gets 2 minutes; `EXO_WATCH_YTDLP_MS` overrides it |
| `SPEECH_MS` | 3600000 | `skills/watch/scripts/transcript.mjs` | transcribing a long video gets 1 hour; `EXO_WATCH_TRANSCRIBE_MS` overrides it |

## Plan loop in this repository

- A plan names no finish route and no commit subject: `ship` asks the route once, at the end. After the end-of-run review passes, the lead squashes the run branch onto `main` as one commit.
- `exo:build <brief>` sends one fresh `exo:builder` per plan task in plan order; the builder runs `land-task.mjs`, which proves red then green, runs the Land gate and commits. To resume, run it again: it reads landed tasks from `Plan-task:` commits.
- Check a plan with `node skills/spec/scripts/plan-check.mjs --plan <plan>`: it names missing sections, a task without `Files:`, `Proof:` or `Data:` (`Data: none (<reason>)` counts), two tasks on one file with no `Depends on:` path between them, a `Data:` that says `read by Task <n>` when that task does not depend on this one, a `Consumes: Task <n>: <name>` whose task is not on a `Depends on:` path, an Acceptance item that cites no task, `Data:` segment or the Success criterion and is not a Manual check, and open points.
- A plan task lands only through that loop, so the lead and subagents commit no plan task on the run branch.
- A blocked task leaves no commit. The lead fixes the plan, or the cause in a worktree subagent, and reruns `exo:build`.
- A Land gate or Success criterion repair on the run branch is a `fix(<scope>):` commit with no `Plan-task:` trailer.
- The end-of-run review is the built-in `code-review` at effort `medium` on the branch diff; a finding gets a fix round only when a command shows it.
- Cleanup drops a stash made on a run branch once its content is on `main`, and every other stash stays untouched.
- Every plan ends with a task that writes its `## Unreleased` line, so the line lands in the run's squash commit.
- Phases hand over through the brief and files in the temp folder.

## Run contract

- `land-task.mjs` lands one plan task: it runs the proof before the change and refuses the task when it passes there, after which the builder stops with `BLOCKED`; it runs the plan's `Land gate:` on the candidate commit and refuses on failure, then commits with the `Plan-task:` trailer.
- `runCheck` in `lib/run-check.mjs` runs a check command through the tree-keyed record in `lib/check-cache.mjs`.

## Defaults

Each variable is read through `environmentMs`: `EXO_PROOF_TIMEOUT_MS` and `EXO_LAND_GATE_TIMEOUT_MS` bound a proof and the Land gate; `EXO_RED_BASE_MARGIN_MS` (`lib/red-green.mjs`, 60000) is the margin added to the base run time of a red proof.

- **Delegate limits**: each agent sets `maxTurns` in its frontmatter, and the harness ends a delegate at that turn.

The plugin ships no permission guard: a cap on what a machine may do belongs in that machine's own configuration.

## Releasing

A release is cut weekly, not per merge: a scheduled run every Monday 06:00 UTC cuts it when `## Unreleased` holds an entry, and `gh workflow run release.yml` (or the Run workflow button on the Actions page, optionally with `-f level=patch|minor|major`) cuts one sooner. A scheduled run uses level `auto`, which reads the level off `## Unreleased`. `.github/workflows/release.yml` runs only on `main`. It checks with `npm run release-pending` whether `## Unreleased` holds an entry; if so it runs `npm run check` and `npm run bump`, commits `chore(release): <version>`, tags `v<version>`, pushes both and publishes the GitHub Release from `npm run release-notes`. With nothing under `## Unreleased` it cuts no release.

A change lands on `main` as one squashed commit carrying its changelog entry, and `### Highlights` when deserved, but no version. A change the user should read first gets at most three bold lead sentences under `### Highlights` in `## Unreleased`, in the commit that records it and not in a release commit; entries collect under `## Unreleased` until the next release. The release push uses `GITHUB_TOKEN`, which starts no further workflow, so the release commit does not release itself. After a release, `claude plugin marketplace update blauwtje` and `claude plugin update exo@blauwtje` install it locally; the marketplace compares only the manifest version, so an unbumped release installs as a no-op.
