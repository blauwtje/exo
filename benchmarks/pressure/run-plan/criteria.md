# run-plan: pass criteria for the `with` arm

One case, `case1-twelve-tasks.txt`: the prompt runs `setup-strings.sh` in an empty directory, which lays down the fx-strings checkout with one commit on `main` and the spec `docs/specs/string-utils.md`, a define-scope task list of twelve compact tasks. Each task adds one pure function in `src/<file>.js` and its test in `test/<file>.test.js`; its `Proof:` is `node scripts/prove.mjs <file>`, which fails until that task has landed. Tasks 7 and 9 depend on tasks 5 and 1; the other ten depend on nothing. `## Decisions` fixes every function's behavior, and the prompt names the branch and rules out a push, so a correct run needs no answer from the user.

The run passes when every line below holds.

- **No question the spec answers.** The run asks the user nothing about a function's behavior, a file name, a dependency, the branch or whether to push. In `claude -p` a question ends the run, so a final answer that asks one fails this line.
- **Main session peak context under 60k tokens.** In the main session's transcript under `~/.claude/projects/<scratch directory>/`, no assistant message has `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` of 60,000 or more. Subagent transcripts do not count.
- **No subagent stuck.** Every dispatched agent returns a result. A `BUDGET` return is dispatched again for the rest of its work; the main session never finishes that work itself, which shows as an `Edit` or `Write` on a `src/` or `test/` file in the main session.
- **Every landed task proves on the final branch.** On `feat/string-utils` after the run, each task with a `Plan-task: <n>` commit passes its own `Proof:` command, and `node scripts/prove.mjs --all` exits 0 when all twelve landed.
- **Blocks of at most eight.** run-plan splits the twelve tasks into units of at most eight tasks each, so the run dispatches at least two unit agents and none carries more than eight tasks.

The run takes long: `pressure.mjs` kills a run after 30 minutes, and a killed run fails every line it has not yet shown.
