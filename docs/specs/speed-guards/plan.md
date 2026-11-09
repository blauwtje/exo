# speed-guards

## Goal

Each guard family whose refused input can be fixed without losing its protection is turned from a refusal into a rewrite, one change per task, and a replay of the recorded refused inputs shows the refusals before and after for each guard.

## Verdict

Verdict: go
Objection: some refusals are correct catches, and turning them into rewrites can lower protection, so each change keeps its guard's protection and carries one named test proving the unsafe case is still stopped.

## Decisions

1. Each rewrite task keeps its guard's protection through one named test that the unsafe case is still stopped. (exo decided)
2. Mechanism: the rewrite proven by a117f222 (an over-limit Bash command runs from its saved script; replay of 724 commands: 643 denials to 0). A rewrite returns `updatedInput` from the hook that owns the guard; no new hook. (exo decided)
3. "Tell upfront" is dropped as a mechanism. The refusal rise came from guards going live on 11-05 (c8274f3e byte limit, a8e7a845 predispatch, d0aaebf9 brief lines), and the rate did not fall after the 11-06 wording change, so the upfront-text premise is untested. No task changes brief or prompt text. (exo decided)
4. Measure: `benchmarks/guard-replay.mjs` extracts, per guard family, the unique refused inputs from cli-entrypoint sessions only, cut at that guard's first live time, and replays them through a base and a candidate hook, modelled on `.exo/speed-all/scripts/byte-replay.mjs`. (exo decided)
5. Each change task gets its own speed-ledger entry with baseline and threshold, written by the lead: `guard-stash-rewrite` (baseline about 270 stash refusals in 14 days, $3.8; threshold 0 stash-save denials on replay, `git stash pop` still denied), `guard-comment-strip` (baseline 27 Write comment refusals, $1.47; threshold 0 comment-only Write denials on replay), `guard-reads-fill` (baseline 25 lacks-Reads refusals, $2.32; threshold at most half on replay). A change whose replay misses its threshold is reverted before the gate. (exo decided)
6. Family ranking by refusals times retry cost (r3-refusals.md, 14 days): byte limit 571, $11.9, already rewritten by a117f222; stash about 270, $3.8, rewrite (Task 2); code-rules Write 54 plus comments 51, $4.5, rewrite only the comment-only case (Task 3); isolated-worktree git forms 245, $3.2, guard removed on 11-05 17:13, no task; brief lines 42, $3.3 in R3 but 394 refusals 11-05 to 11-09 (guards-cause.md), rewrite only a derivable `Reads:` (Task 4); predispatch 65, $1.7, 3,086 s, stays a refusal; context limits 150, $0.35, stays a refusal; worktree remove and branch delete 48, $0.6, stays a refusal; wide find 26, $0.25, stays a refusal. (exo decided)
7. Rewrites are Bash and Write only for code: Edit is not rewritten, because upstream reports `updatedInput` ignored for Edit. (exo decided)

## Non-goals

- Predispatch (lib/slice-state.mjs), context limits (lib/context-decisions.mjs), worktree remove and branch delete (lib/git-deny.mjs), wide find (hooks/dispatch-bash.mjs `FIND_STEP`): they stay refusals.
- Brief and prompt text in agents/ and lib/brief-rules.mjs.
- The Bash 120 s cap in hooks/dispatch-bash.mjs, planned in .exo/speed-all/bash-cap.md.
- Ledger, sweep, results and changelog files (`benchmarks/speed-ledger.md`, `benchmarks/results/`, `CHANGELOG.md`); the lead writes them.

## Assumptions

- [code] The plan builds on main after spec/speed-all lands; that branch also changes hooks/dispatch-bash.mjs, and the Bash cap follows it there.
- [code] `firstRewrite` (hooks/dispatch-bash.mjs:141-144) keeps only the first `updatedInput` in step order, so a stash rewrite from `SHARED_STATE_STEP` wins over the result-cap and shell-fix rewrites for that call, and the Bash cap must compose with it.
- [code] lib/code-rules.mjs is listed in verify/module-size-ceilings.txt, so Task 3 lists the ceilings file.
- [code] `hooks/agent-effort.mjs:63` already returns `updatedInput` with `allow` on Agent, so an Agent rewrite works in practice.
- [assume] Claude Code applies `updatedInput` from a Bash and Write PreToolUse hook in cli sessions; upstream reports it ignored in `claude -p`, so the replay counts hook output, not live runs.
- [assume] A task that changes a guard's deny text may trip registry or test rows outside its Files:; its builder checks tests/guard-rules.test.mjs first.

## Acceptance

- Task 1: `benchmarks/guard-replay.mjs` prints per family the unique refused inputs and the base and candidate deny, rewrite and pass counts.
- Task 2: a subagent's `git stash` runs as a saved patch and never reaches the shared stash list; `git stash pop` is still denied.
- Task 3: a Write whose only break is added comment lines lands with those lines stripped; a nested ternary is still refused.
- Task 4: an Agent brief that names paths but lacks `Reads:` gets those paths as its `Reads:` line; a brief naming none is still refused.
- Success criterion: `npm run check` ends `FAIL=0 WARN=0 UNRUN=0`.

## Plan basis

Repository: /Users/thomash/Documents/Code/personal/plugins/exo
Branch: spec/speed-guards
Worktree setup: none
Land gate: npm run validate:static
Land: local
Commit: perf(guards): rewrite refused inputs where the guard's protection holds
Lint: none
App: none
Allow: none

## Success criterion

`npm run check`
Red: none (the repo gate passes on its base by design; each task's Proof is seen red, then green)
Product run: none (package.json has no bin and no start script)

## Checkpoint

Blocks first: none
Shared state: Tasks 2, 3 and 4 share `CONTRIBUTING.md`, Tasks 2 and 3 share `verify/budgets.mjs`; hooks/dispatch-bash.mjs is shared with spec/speed-all and the Bash cap
Smallest safe split: Task 1 alone, then Tasks 2, 3 and 4 in order
Parallel: Tasks 1 and 2

## Tasks

### Task 1: feat(benchmarks): replay each guard's recorded refused inputs through a base and a candidate hook

Depends on: none | Files: `benchmarks/guard-replay.mjs`, `tests/guard-replay.test.mjs` | Data: one corpus per guard family, keyed by family id and holding its first live time and unique refused inputs | Evidence: none (a benchmark script, no skill or agent wording) | Proof: node --test tests/guard-replay.test.mjs

### Task 2: perf(hooks): run a subagent's git stash as a saved patch instead of denying it

Depends on: none | Files: `lib/git-deny.mjs`, `hooks/dispatch-bash.mjs`, `tests/dispatch-bash-stash-rewrite.test.mjs`, `tests/dispatch-bash-long-rewrite.test.mjs`, `tests/hooks.test.mjs`, `verify/budgets.mjs`, `CONTRIBUTING.md` | Data: the `SHARED_STATE_STEP` output gains an `updatedInput` command for the stash save form | Risk: security boundary | Boundary: in a subagent `git stash` or `git stash push` | out `git stash pop`, `apply`, `drop`, `list` and a lead call | test tests/dispatch-bash-stash-rewrite.test.mjs | Evidence: none (hook code, no skill or agent wording) | Proof: node --test tests/dispatch-bash-stash-rewrite.test.mjs

### Task 3: perf(hooks): strip added comment lines from a Write instead of refusing it

Depends on: 2 | Files: `lib/code-rules.mjs`, `hooks/dispatch-edit.mjs`, `verify/module-size-ceilings.txt`, `tests/edit-code-rules.test.mjs`, `tests/code-rules.test.mjs`, `verify/budgets.mjs`, `CONTRIBUTING.md` | Data: the Write decision gains an `updatedInput` content when comment lines are its only break | Evidence: none (hook code, no skill or agent wording) | Proof: node --test tests/edit-code-rules.test.mjs

### Task 4: perf(hooks): fill a missing Reads line from the paths an Agent brief names

Depends on: 3 | Files: `lib/brief-denials.mjs`, `hooks/agent-effort.mjs`, `tests/brief-denials.test.mjs`, `tests/agent-effort.test.mjs`, `CONTRIBUTING.md` | Data: `briefedInput` returns a prompt with a `Reads:` line built from the brief's own paths | Evidence: none (hook code, no skill or agent wording) | Proof: node --test tests/brief-denials.test.mjs
