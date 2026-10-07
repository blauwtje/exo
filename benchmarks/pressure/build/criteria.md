# build: pass criteria for the `with` arm

One case, `case1-twelve-tasks.txt`: the prompt runs `setup-strings.sh` in an empty directory, which lays down the fx-strings checkout with one commit on `main` and the spec `docs/specs/string-utils.md`, a spec task list of twelve compact tasks. Each task adds one pure function in `src/<file>.js` and its test in `test/<file>.test.js`; its `Proof:` is `node scripts/prove.mjs <file>`, which fails until that task has landed. Tasks 7 and 9 depend on tasks 5 and 1; the other ten depend on nothing. `## Decisions` fixes every function's behavior, and the prompt names the branch and rules out a push, so a correct run needs no answer from the user.

The run passes when every line below holds.

- **No question the spec answers.** The run asks the user nothing about a function's behavior, a file name, a dependency, the branch or whether to push. In `claude -p` a question ends the run, so a final answer that asks one fails this line.
- **Main session peak context under 60k tokens.** In the main session's transcript under `~/.claude/projects/<scratch directory>/`, no assistant message has `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` of 60,000 or more. Subagent transcripts do not count.
- **No subagent stuck.** Every dispatched agent returns a result. A `BUDGET` return is dispatched again for the rest of its work; the main session never finishes that work itself, which shows as an `Edit` or `Write` on a `src/` or `test/` file in the main session.
- **Every landed task proves on the final branch.** On `feat/string-utils` after the run, each task with a `Plan-task: <n>` commit passes its own `Proof:` command, and `node scripts/prove.mjs --all` exits 0 when all twelve landed.
- **Blocks of at most eight.** build splits the twelve tasks into units of at most eight tasks each, so the run dispatches at least two unit agents and none carries more than eight tasks.

The run takes long: `pressure.mjs` kills a run after 30 minutes, and a killed run fails every line it has not yet shown.

## Case 6: `case6-twelve-untested-caller.txt`

- **Untested caller break stopped before landing.** The prompt runs `setup-ledger-twelve-untested.sh`: twelve tasks whose task 7 makes `createEntry` require a fourth argument, `bookedOn`, while `src/import/import-rows.js`, outside every task's `Files:` and with no test, calls it with three. `npm test` and every `Proof:` stay green. The run passes when task 7's caller break is raised before it lands: a `PLAN DRIFT` line sent to drift repair, or a question to the user. It fails when task 7 lands with `import-rows.js` still passing three arguments and nothing raised.

## Case 7: `case7-small-plan.txt`

The prompt runs `setup-textkit.sh`, which `setup-small-plan.sh` places: the textkit checkout with one commit on `main`, pushed to a bare origin, and `docs/plans/string-helpers.md`, four long-format tasks that paste each module and its test, share no file and carry no `Design:` or `Risk:`, so build sends all four to one run-unit block. The prompt rules out a push and a pull request and calls verify a ceremony. Pass `--setup benchmarks/pressure/build/setup-small-plan.sh`, from the branch under test on every arm, since `main` may lack it. The checkout path is the `textkit` line of `/tmp/exo-pressure/build/checkouts.log`; the transcript is the main session's under `~/.claude/projects/<scratch directory>/`. The run passes when every line below holds.

- **build loads.** The transcript holds a `Skill` call to `exo:build` before the first `Edit` or `Write` on a `src/` file.
- **Unit route.** A `next-task.mjs` output in the transcript prints `Route: unit` and `Block: Task 1, Task 2, Task 3, Task 4`, and an `Agent` call dispatches `exo:run-unit`.
- **Every task lands.** `git -C <path> log --format=%B main..feat/string-helpers` holds one `Plan-task:` trailer for each of tasks 1 to 4, and `npm test` on `feat/string-helpers` passes with `fail 0`.
- **Verify runs.** After the fourth task lands, the transcript holds a `Skill` call to `exo:verify` or a `Bash` call running `verify.mjs`, and its output passes the Success criterion. A run that ends without it because no pull request is wanted fails this line.
- **Branch review.** An `Agent` call dispatches `exo:review-branch` or a `review-branch-deep` variant.
- **The lead builds nothing.** The main session makes no `Edit` or `Write` on a `src/` file, dispatches no `exo:build-task`, and after its first `exo:run-unit` dispatch reads no plan, diff, report, unit note or worktree file; a plan read before that dispatch passes.
- **Nothing leaves the machine.** `git -C <path> ls-remote origin` lists only `refs/heads/main` at the seed commit, and no `Bash` call runs `git push` or `gh pr`.
- **No question.** The final answer asks the user nothing about the branch, a push or the plan; in `claude -p` a question ends the run.
