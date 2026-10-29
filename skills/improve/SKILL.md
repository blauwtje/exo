---
name: improve
description: Use when the user invokes it to raise one score in a repo in an unattended loop, keeping a commit only when one fixed score command gets better and logging every round. Not for a one-off change.
argument-hint: "<goal>"
disable-model-invocation: true
---

# Improve a score in a loop

Each round one worker commits one idea; a script scores it, keeps it only when the score got better, else resets, and logs one row. The enemy is a loop that moves the goalposts: a changed scorer, a score read from chat, a kept commit that is not better. The overcorrection is a loop that stops to ask, so the user finds it idle.

The run is its own plan: branch `improve/<tag>`, its rows and its kept commits replace spec, build and gate, so call none of them.

`<root>` = the checkout this session starts in; every script gets `--root <root>`, and all run state lives in `<root>/.exo/improve/`.

## Setup

Run once, then start round 1 in the same turn.

- Resume → only when the user asks to continue an earlier run and its `.exo/improve/<tag>.tsv` exists: run `setup.mjs --root <root> --resume --tag <tag>`, ask nothing, go to Round.
- Any other start → new run, even when an `improve/*` branch or results file exists.
- Settings → derive each from the goal and the repo (benchmarks, test scripts, `package.json` scripts), not from the user.
- Scope → globs of the files the goal's outcome depends on; every other file is read-only.
- Unsure whether a file belongs in scope → it is not in scope.
- Score command → an existing command that measures the goal and prints one number; `--regex` captures that number in group 1; `--direction` → `higher` or `lower` is better.
- Read-only → the score command's own files and every file it reads.
- Limit → setup derives it, except when the user gave one; then pass `--limit <s>`.
- Fast check → one static check under 60 s that catches a broken edit, such as a lint or syntax check; none in the repo → omit `--fast-check`.
- Goal question → at most one, in plain language, only about what should get better; none when the goal names an outcome.
- No question about commands, files, patterns or limits; the user may not know them.
- No command measures the goal → build a scorer per `### Build a scorer` before setup.
- Setup → `node "${CLAUDE_SKILL_DIR}/scripts/setup.mjs" --root <root> --goal <text> --command <cmd> --regex <re> --direction higher|lower --scope <glob,...> [--readonly <path,...>] [--limit <s>] [--fast-check <cmd>] [--scorer <path,...>] [--no-overlap] [--built-scorer] [--keep-margin <k>] [--confirm] [--stop-after <n>]`.
- `--no-overlap` → only when the score measures wall time; setup stores it in `<tag>.json` and the round skips prepare-ahead.
- `--keep-margin`, `--confirm`, `--stop-after` → only when the user asks for them; each is off by default and stored in `<tag>.json`.
- `--keep-margin <k>` → a keep needs a gain over k·sd on the last keep; a commit that leaves less code keeps on a gain from 0 up to k·sd.
- `--confirm` → a score past the margin gets one more candidate score and one fresh score of the last keep in the same round; keep or discard is decided on the means.
- `--stop-after <n>` → after n rounds in a row without a keep, `round.mjs` prints `STOP no-keep <n>`.
- Setup exits nonzero → fix the flag its output names, rerun.
- Settled line → `key=value` fields; read `tag`, `worktree`, `next`, `limit`, `model`, `effort` and `no-overlap` once; every worker dispatch passes that model and effort.
- Settled → one message, not a question: scope, command, direction, limit, branch, worktree and baseline `score`; a built scorer adds its path, case count and 2 raw case outputs with their scores.
- Settled message sent → dispatch round 1 in the same turn.

### Build a scorer

- Write the score command with its cases and inputs; it prints one `<id> ratio=<n>` line per case, so the gate can size ideas by headroom, and the score on its own last line.
- Pass every scorer path in `--scorer`; setup commits them on `improve/<tag>` before round 0 and freezes them, so the user's branch gets no commit.
- Pass `--built-scorer` too; setup degrades one scope file in a throwaway worktree and rejects the scorer unless the score moves more than 2·sd in the bad direction.
- Setup rejects the scorer → fix the scorer, rerun setup, which returns the same tag because it deleted the rejected `improve/<tag>`; a scorer blind to a worse file cannot judge a round.
- Second rejection → report it and stop.

## Round

Setup done → never ask the user anything; the user may be away. Read only each worker's return line and `round.mjs` output, never a diff, a log or a score from chat.

1. Dispatch one `general-purpose` delegate whose prompt opens with `exo-kind: improve-round`: the text of `references/worker.md` with `<worktree>` = settled `worktree`, `<idea>` = `<root>/.exo/improve/<tag>.idea.json`, and the settled model and effort.
2. `IDEA <hash> <key>` → run `node "${CLAUDE_SKILL_DIR}/scripts/round.mjs" --root <root> --tag <tag> --commit <hash> --idea <idea>` in the background.
3. Prepare ahead → right after step 2 starts, dispatch the next worker the same way, with `<worktree>` = settled `next` and `<idea>` = `<root>/.exo/improve/<tag>.next.idea.json`.
4. Wait → end the turn; step 2's completion notification ends the round, and its output holds `ROW <hash> <score> <status> best=<score>` → round done.
5. Prepared `IDEA <hash>` → hold it until the round's `ROW` arrives, then `round.mjs --root <root> --tag <tag> --commit <hash> --idea <next idea path> --adopt` in the background, then step 3; no prepared idea → step 1.
6. `REFUSED <reason>` → drop any idea prepared meanwhile, step 1.
7. `NO-IDEA <reason>` → step 1 with the reason as `<note>`.
8. Third `NO-IDEA` in a row → step 1 with `<note>` = `out-of-ideas`; the loop goes on.

- Prepare ahead → every round, except when the settled line says `no-overlap=true`; the worker's load would skew a wall-time score.
- Waits → the round's notification without `ROW`, `STOP` or `REFUSED` in its output → go to Stop.
- `STOP <reason> <detail>` (`scorer-changed <path>`, `reset-failed <hash>`, `checkout-failed <hash>`, `no-keep <n>`) → drop any prepared idea, go to Stop, naming both.
- Score → the lead runs no score command after setup; `round.mjs` owns all scoring, rows, keeps and resets.

## Crash

- Score missing from the log, nonzero exit, or run over the limit → `round.mjs` reruns once on an infra cause, then writes a `crash` row with score `0` and resets to the last keep.
- Crash row → next round as usual, no fix round; a crash row does not ban its key, so the next worker may retry that idea with the cause fixed.

## Stop

- Trigger → the user interrupts, a stall, or a `STOP` line.
- Stop → end the background `round.mjs`; report the best kept score against the baseline, the branch, the worktree, and the trigger when it was not the user.
- Leave the branch, both worktrees and every `.exo/improve/` file in place.

## Judgment

- Run until the user interrupts or `round.mjs` prints `STOP`; a question after setup finds no one.
- Kept commit → only from a `round.mjs` `keep` row.

| File | Read it when |
|---|---|
| `references/worker.md` | Before the first worker dispatch; every worker prompt is its text, placeholders filled. |
