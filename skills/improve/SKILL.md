---
name: improve
description: Use when the user asks to raise one score in a loop. Not for a one-off change.
argument-hint: "<goal>"
---

# Improve a score in a loop

Each round one worker commits one idea; a script scores it, keeps it only when the score got better, else resets, and logs one row. The enemy is a loop that moves the goalposts: a changed scorer, a score read from chat, a kept commit that is not better. The overcorrection is a loop that stops to ask, so the user finds it idle.

The run is its own plan on branch `improve/<tag>`; call no spec, build or gate. It starts in the current session in one command, then runs until Stop. State lives in `<root>/.exo/improve/`, `<root>` = the checkout this session starts in.

## Start

- Resume → only when the user asks to continue an earlier run: `node "${CLAUDE_SKILL_DIR}/scripts/setup.mjs" --resume [--tag <tag>]`, ask nothing, go to Round.
- Any other start → new run, even when an `improve/*` branch or results file exists.
- Settings → derive each from the goal and the repo (benchmarks, test scripts, `package.json` scripts), not from the user.
- Scope → globs of the files the goal's outcome depends on; unsure whether a file belongs → it is not in scope.
- Score command → an existing command that measures the goal and prints one number; `--regex` captures it in group 1; `--direction` → `higher` or `lower` is better.
- Read-only → the score command's own files, `--readonly <path,...>`.
- No command measures the goal → write the scorer with its cases, pass its paths in `--scorer`; setup commits and freezes them on `improve/<tag>`.
- Goal question → at most one, in plain language, only about what should get better; no question about commands, files, patterns or limits.
- Run `node "${CLAUDE_SKILL_DIR}/scripts/setup.mjs" --goal <text> --command <cmd> --regex <re> --direction higher|lower --scope <glob,...> [--readonly <path,...>] [--scorer <path,...>] [--fast-check <cmd>] [--limit <s>]`; one baseline run, then one line `tag= branch= worktree= score= limit= model= effort= brief=<path>`.
- Setup exits nonzero → fix the flag or step its output names, rerun.
- Settled → one message, not a question: scope, command, direction, limit, branch, worktree, baseline `score`; then round 1 in the same turn.

## Round

Never ask the user anything; the user may be away. Read only each worker's return line and `round.mjs` output, never a diff, a log or a score from chat. A round is two tool calls.

1. Dispatch one `general-purpose` delegate whose prompt opens with `exo-kind: improve-round`, then `Follow <brief>.` with `brief` from the settled line, and the settled model and effort. The prompt is the same every round; `round.mjs` rewrites the brief.
2. `IDEA <hash>` → run `node "${CLAUDE_SKILL_DIR}/scripts/round.mjs" --root <root> --tag <tag> --commit <hash>`, in the background when `limit` > 500; its output `ROW <hash> <score> <status> best=<score>` ends the round, then step 1.
3. `NO-IDEA <reason>` → step 1 again; a third in a row → keep going.
4. `STOP <reason> <detail>` (`scorer-changed`, `reset-failed <hash>`, `no-keep 10`) → Stop, naming both.
5. Score → the lead runs no score command after setup; `round.mjs` owns scoring, rows, keeps and resets.
6. Crash row → next round as usual; its idea may be retried with the cause fixed.

## Stop

- Trigger → the user interrupts, a stall, or a `STOP` line.
- Report the best kept score against the baseline, the branch, the worktree, and the trigger when it was not the user.
- Leave the branch, the worktree and every `.exo/improve/` file in place.

## Judgment

- Run until the user interrupts or `round.mjs` prints `STOP`; a question after setup finds no one.
- Kept commit → only from a `round.mjs` `keep` row; no edit to the scorer, no score from chat.

| File | Read it when |
|---|---|
| `references/worker.md` | Setup and `round.mjs` fill it into `<tag>.brief.md`; open it only to change the worker's steps. |
