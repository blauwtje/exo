# Speed-guards: guard refusals replayed, 2026-11-09

Base `70bcb0c7`, branch `spec/speed-guards` at `6c47e20e`.

## Method

`benchmarks/guard-replay.mjs` replays recorded refused tool inputs through a guard on the base and on the branch and counts denied, rewritten and allowed results. The inputs come from cli sessions only, cut at each guard's first live time. The stash family corpus is `corpus-lead.json`, 97 unique inputs.

## Cause of the refusal rise

Refusals per 1k tool calls rose from 8.4 to 38.0 (cli sessions, cut at 2026-11-05 11:15Z), and the rise began about 12:40 local on 11-05, when the new agent guards went live. It did not begin with the 11-06 squash `d8327eeb`, and the rate did not fall when the "Do instead" wording went live on 11-06. The rise is in every agent type and every repo with data, and the mix of agent types explains about 1 point of the 29. The refusals come from the guards going live, not from the upfront text failing.

## Write comment-only lines stripped (landed)

| Arm | Denied | Rewritten | Comment-only refusals |
|---|---|---|---|
| base | 88 | 0 | present |
| branch | 71 | 17 | 0 |

A live check with `claude -p` on a main-thread Write (tmp dir, `--plugin-dir` of the worktree, `--setting-sources project`, acceptEdits, $0.08) removed the comment line and kept the export line. Without `--setting-sources project` the installed exo also loads and denies the comment.

## Subagent read-only stash list and show (landed)

Stash denials 95 -> 19 (80%). 0 corpus commands with a mutating stash form are allowed, and 190 tests pass. The 4 list denials left are compounds with a mutating stash.

## Stash save rewritten to a patch (rejected)

Base 95 deny and 2 rewrite; candidate 91 deny and 6 rewrite. 8 bare save denials were left against threshold 0, so it was reverted (`034cf90a`). Retry when saves with `-u`, `push -- <paths>` and a same-command pop are covered.

## Missing Reads: filled from named paths (rejected)

43 refusals left against a limit of 31. About 20 may come from the replay's empty folder, where the named paths do not exist. Retry when the replay runs in a checkout that has the named paths.

## Verdicts

| Change | Verdict |
|---|---|
| Per-guard replay benchmark | landed (tooling) |
| Write comment strip | landed |
| Stash list and show | landed |
| Stash save rewrite | rejected |
| Missing Reads fill | rejected |
