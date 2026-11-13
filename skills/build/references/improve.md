# Improve a score in a loop

Goal: raise one score over rounds, keeping a commit only on a proven gain, until a Stop trigger. The enemy is a loop that moves the goalposts: a changed scorer, a score read from chat, a kept commit that is not better. The overcorrection is a loop that stops to ask, so the user finds it idle.

Each round one worker, or the **lead** (this session) on a small scope, commits one idea. A script scores it and keeps it only when its gain over the kept commit clears the score's noise, else resets, and logs one row.

The run is its own plan on branch `improve/<tag>`, so call no spec, build or gate. It starts in the current session in one command, then runs until Stop. State lives in `<root>/.exo/improve/`, where `<root>` is the checkout this session starts in.

## Start

- To resume, the user must ask to continue an earlier run. Then run `node "${CLAUDE_SKILL_DIR}/scripts/setup.mjs" --resume [--tag <tag>]`, ask nothing and go to Round.
- Any other start is a new run, even when an `improve/*` branch or results file exists.
- Derive each setting from the goal and the files read at start, not from the user. Open benchmarks, test scripts or `package.json` only for a setting the goal leaves open.
- Scope is globs of the files the goal's outcome depends on. When unsure whether a file belongs, leave it out of scope.
- The score command is an existing command that measures the goal and prints one number. `--regex` captures it in group 1, and `--direction` says whether `higher` or `lower` is better.
- Score inputs are fixed: the same cases every run, with any randomness seeded from env `EXO_SEED`, which every score run gets from `defaults.improve.seed`.
- A score made of cases may also print one `ITEM <id> <number>` line per case. `round.mjs` then compares the candidate with the kept commit case by case.
- At `defaults.improve.holdoutMin` ITEM ids or more, setup holds out a `holdoutShare` of them and prints `holdout=<held>/<cases>`. Score, rows and `CASES` use the other cases only, and a keep that clearly lowers the held-out cases becomes `discard-holdout`.
- Read-only files are the score command's own files, passed as `--readonly <path,...>`.
- When no command measures the goal, write the scorer with its cases and pass its paths in `--scorer`. Setup commits and freezes them on `improve/<tag>`.
- Ask at most one goal question, in plain language, and only about what should get better. Ask nothing about commands, files, patterns or limits.
- Run `node "${CLAUDE_SKILL_DIR}/scripts/setup.mjs" --goal <text> --command <cmd> --regex <re> --direction higher|lower --scope <glob,...> [--readonly <path,...>] [--scorer <path,...>] [--fast-check <cmd>] [--limit <s>] [--first <dir> --first-subject <text>]`. It runs `defaults.improve.baselineRuns` baseline runs, then prints one line `tag= branch= worktree= score= limit= seed= sd= mde= holdout= model= effort= noidea= mode= brief=<path>`.
- When the files to change were read before setup, one Bash command carries round 1: `mkdir -p .exo/improve/first && cat > .exo/improve/first/<repo path> <<'EOF' ... EOF && node "${CLAUDE_SKILL_DIR}/scripts/setup.mjs" <flags> --first .exo/improve/first --first-subject <change in plain words>`. Setup commits and scores it and prints its `ROW` line.
- Check the idea through the `ROW` line, its `CASES` line with the cases that moved most, and after any row but a keep its `OUT` lines with the score command's output. Run no test, check or score of the idea before it.
- Pick the next idea only after reading the last round's `CASES` and `OUT` lines.
- The first idea is the strongest method known for the goal, as in Inline idea.
- When setup exits nonzero, fix the flag or step its output names and rerun.
- Once settled, send one message that is not a question: scope, command, direction, limit, branch, worktree, baseline `score`, its noise `sd` and smallest detectable gain `mde`, `holdout`, and any round-1 `ROW`. Then start the next round in the same turn.

## Round

Ask the user nothing, because the user may be away. Read only each worker's return line and `round.mjs` output, not a diff, a log or a score from chat.

- With `mode=worker`, read the worker-round reference before round 1 and follow it through Stop. The inline bullets below do not apply.
- With `mode=inline` there is no delegate. One round is one Bash command that writes one idea, commits only the edited files with the change in plain words under 72 characters as subject, then runs `node "${CLAUDE_SKILL_DIR}/scripts/round.mjs" --root <root> --tag <tag> --commit $(git rev-parse --short HEAD)`.
- Open each inline command with `cd` to the worktree's absolute path, because the shell keeps its directory between commands.
- An inline idea comes from the files read at start and the `ROW` lines, and is untried. Start with the strongest method known for the goal, not a stepping stone toward it.
- An inline discard resets the worktree to the best commit, so a retry of the discarded idea starts from `git show <hash>:<file>`.
- Inline bounds: edit nothing the scorer reads and add no special case for its cases.
- Inline, with no idea left or on an interrupt, Stop. Run `node "${CLAUDE_SKILL_DIR}/scripts/round.mjs" --root <root> --tag <tag> --report`, then report the best kept score against the baseline, its `HOLDOUT` line, the branch, the worktree and the reason, and leave them and `.exo/improve/` in place.
- The lead runs no score command, test or check of its own, before setup or after. `round.mjs` owns scoring, rows, keeps and resets.
- After a crash row, its idea may be retried with the cause its `OUT` lines name fixed.

## Judgment

- Run until a Stop trigger, because a question after setup finds no one.
- A kept commit comes only from a `round.mjs` `keep` row. Edit no scorer and take no score from chat.
- At an equal score the simpler commit wins. A removal that keeps the score is a win, and a tiny gain that adds much code is not worth it.
- `round.mjs` reruns a noisy score up to `defaults.improve.maxRuns` times and keeps only when the lower bound of the gain's `keepZ` interval exceeds `keepFloor`. An exact score decides on one run.
- After 2 rounds without gain, label each failing case in the last `CASES` lines agent fault or case fault per measured-goal step 6. The next idea targets only agent faults, and the Stop report lists the case faults.
