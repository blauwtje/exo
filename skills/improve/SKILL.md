---
name: improve
description: Use when the user asks to raise one score in a loop. Not for a one-off change.
argument-hint: "<goal>"
---

# Improve a score in a loop

Each round one worker, or the lead on a small scope, commits one idea; a script scores it, keeps it only when its gain over the kept commit clears the score's noise, else resets, and logs one row. The enemy is a loop that moves the goalposts: a changed scorer, a score read from chat, a kept commit that is not better. The overcorrection is a loop that stops to ask, so the user finds it idle.

The run is its own plan on branch `improve/<tag>`; call no spec, build or gate. It starts in the current session in one command, then runs until Stop. State lives in `<root>/.exo/improve/`, `<root>` = the checkout this session starts in.

## Start

- Resume → only when the user asks to continue an earlier run: `node "${CLAUDE_SKILL_DIR}/scripts/setup.mjs" --resume [--tag <tag>]`, ask nothing, go to Round.
- Any other start → new run, even when an `improve/*` branch or results file exists.
- Settings → derive each from the goal and the files read at start, not from the user; open benchmarks, test scripts or `package.json` only for a setting the goal leaves open.
- Scope → globs of the files the goal's outcome depends on; unsure whether a file belongs → it is not in scope.
- Score command → an existing command that measures the goal and prints one number; `--regex` captures it in group 1; `--direction` → `higher` or `lower` is better.
- Score inputs → fixed: the same cases every run, any randomness seeded from env `EXO_SEED`, which every score run gets from `defaults.improve.seed`.
- Score made of cases → the command may also print one `ITEM <id> <number>` line per case; `round.mjs` then compares the candidate with the kept commit case by case.
- Held-out cases → at `defaults.improve.holdoutMin` ITEM ids or more, setup holds out a `holdoutShare` of them, `holdout=<held>/<cases>`; score, rows and `CASES` use the other cases only, and a keep that clearly lowers the held-out cases becomes `discard-holdout`.
- Read-only → the score command's own files, `--readonly <path,...>`.
- No command measures the goal → write the scorer with its cases, pass its paths in `--scorer`; setup commits and freezes them on `improve/<tag>`.
- Goal question → at most one, in plain language, only about what should get better; no question about commands, files, patterns or limits.
- Run `node "${CLAUDE_SKILL_DIR}/scripts/setup.mjs" --goal <text> --command <cmd> --regex <re> --direction higher|lower --scope <glob,...> [--readonly <path,...>] [--scorer <path,...>] [--fast-check <cmd>] [--limit <s>] [--first <dir> --first-subject <text>]`; `defaults.improve.baselineRuns` baseline runs, then one line `tag= branch= worktree= score= limit= seed= sd= mde= holdout= model= effort= noidea= mode= brief=<path>`.
- Files to change read before setup → one Bash command carries round 1: `mkdir -p .exo/improve/first && cat > .exo/improve/first/<repo path> <<'EOF' ... EOF && node "${CLAUDE_SKILL_DIR}/scripts/setup.mjs" <flags> --first .exo/improve/first --first-subject <change in plain words>`; setup commits and scores it and prints its `ROW` line.
- Idea check → the `ROW` line, its `CASES` line with the cases that moved most, and after any row but a keep its `OUT` lines with the score command's output; no test, check or score run of the idea before it.
- Next idea → only after reading the last round's `CASES` and `OUT` lines.
- First idea → the strongest method known for the goal, as in Inline idea.
- Setup exits nonzero → fix the flag or step its output names, rerun.
- Settled → one message, not a question: scope, command, direction, limit, branch, worktree, baseline `score`, its noise `sd` and smallest detectable gain `mde`, `holdout`, and any round-1 `ROW`; then the next round in the same turn.

## Round

Never ask the user anything; the user may be away. Read only each worker's return line and `round.mjs` output, never a diff, a log or a score from chat.

- `mode=worker` → read `references/worker-round.md` before round 1 and follow it through Stop; the inline bullets below do not apply.
- `mode=inline` → no delegate: one round is one Bash command that writes one idea, commits only the edited files with the change in plain words under 72 characters as subject, then runs `node "${CLAUDE_SKILL_DIR}/scripts/round.mjs" --root <root> --tag <tag> --commit $(git rev-parse --short HEAD)`.
- Inline command → opens with `cd` to the worktree's absolute path; the shell keeps its directory between commands.
- Inline idea → from the files read at start and the `ROW` lines, untried; the strongest method known for the goal first, not a stepping stone toward it.
- Inline discard → resets the worktree to the best commit, so a retry of the discarded idea starts from `git show <hash>:<file>`.
- Inline bounds → no edit to what the scorer reads, no special case for its cases.
- Inline, no idea left or an interrupt → Stop: run `node "${CLAUDE_SKILL_DIR}/scripts/round.mjs" --root <root> --tag <tag> --report`; report the best kept score against the baseline, its `HOLDOUT` line, the branch, the worktree and the reason; leave them and `.exo/improve/` in place.
- Score → the lead runs no score command, test or check of its own, before setup or after; `round.mjs` owns scoring, rows, keeps and resets.
- Crash row → its idea may be retried with the cause its `OUT` lines name fixed.

## Judgment

- Run until a Stop trigger; a question after setup finds no one.
- Kept commit → only from a `round.mjs` `keep` row; no edit to the scorer, no score from chat.
- Simplicity → at an equal score the simpler commit wins; a removal that keeps the score is a win; a tiny gain that adds much code is not worth it.
- Keep rule → `round.mjs` reruns a noisy score up to `defaults.improve.maxRuns` times and keeps only when the lower bound of the gain's `keepZ` interval exceeds `keepFloor`; an exact score decides on one run.

| File | Read it when |
|---|---|
| `references/worker-round.md` | `mode=worker`, before round 1. |
| `references/worker.md` | Setup and `round.mjs` fill it into `<tag>.brief.md`; open it only to change the worker's steps. |
