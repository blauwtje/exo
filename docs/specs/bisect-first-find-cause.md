# Bisect-first find-cause

## Goal
When `exo:find-cause` gets a regression with a one-command repro, `skills/find-cause/scripts/bisect.mjs` names the first bad commit with its diff before any model investigates, and a flaky or unbisectable repro falls back to today's loop.

## Decisions
1. New script `skills/find-cause/scripts/bisect.mjs`, flags `--repro <command>` (required), `--good <ref>`, `--help` through `parseFlags` usage in `lib/script-flags.mjs`; Node built-ins and repo libs only; zero model turns. (exo decided)
2. Good-ref candidates, first that passes wins: `--good`; the newest strict ancestor of HEAD whose body holds a `Proof:` line naming the same command (backticks optional, then ` → `, ` -> ` or `: pass`), found with `git log -F --grep=<repro> HEAD~1`; the merge-base of HEAD with `refs/remotes/origin/HEAD` when it differs from HEAD (the run base); then HEAD~1, ~2, ~4, ~8, ~16, ~32 where they exist. Duplicate SHAs drop. (exo decided)
3. A matching `Proof:` line only nominates a candidate; the repro run decides. A candidate runs once; a fail moves to the next candidate; a pass runs once more, and a second-run fail stops with `flaky repro`. (exo decided)
4. HEAD check: the repro runs twice at HEAD; two passes → `Bisect: no failure at HEAD`; one pass and one fail → `Bisect: flaky repro`; only two fails continue. (exo decided)
5. Every repro run, including each bisect step, happens in a detached temporary worktree through `runInWorktree` in `lib/red-green.mjs`, which links `node_modules`, strips run variables and removes the worktree; the user's checkout, its HEAD, index and the shared stash list stay untouched. (exo decided)
6. Bisect = one `runInWorktree` call at HEAD whose command is `git bisect start <head> <good> && git bisect run node <bisect.mjs> --probe <repro>`, the repro single-quoted the way `shellQuote` in `hooks/run-stall-guard.mjs` quotes; `refs/bisect` and the bisect log live in that worktree's git dir and go with it. `<bisect.mjs>` is the running script's own absolute path from `import.meta.url`, not a copy in the bisected tree. Git's default walk, no `--first-parent`. (exo decided)
7. Internal `--probe <command>` mode runs the command through `runGuarded` and `stallSeconds` in `lib/stall-guard.mjs` and maps its exit: 0 → 0; 124 (stall), 125, 126, 127 and above → 125 (skip); every other code → 1. Every repro run in Decisions 3, 4 and 8 goes through the same probe command, so all runs share the stall rule. (exo decided)
8. After bisect names a commit, it runs once more at that commit (must fail) and once at its first parent (must pass); either mismatch → `Bisect: flaky repro`. (exo decided)
9. Per-run time cap `EXO_BISECT_PROBE_MS` through `environmentMs`, default 600000; the bisect call's cap is that value times (ceil(log2(commit count good..HEAD)) + 2). (exo decided)
10. Success stdout, at most 30 lines in this order: `First bad: <sha> <subject>`, `Good: <sha> (<flag|proof trailer|merge-base|HEAD~n>)`, `Diff: <path>`, `Log: <path>`, the `git show --stat --format=` lines, then hunks of changed files whose path appears in the HEAD repro output, cut at line 30; exit 0. (exo decided)
11. Fallback stdout: one `Bisect: <reason>` line, reason one of `no failure at HEAD`, `flaky repro`, `no passing commit in <n> candidates`, `unbisectable: <last git bisect line>`, `error: <cause>`; exit 1. Usage error → stderr, exit 2. (exo decided)
12. `Diff:` = full `git show <sha>` and `Log:` = every run's output, both under the checkout's `.exo/debug/` via `scratchPath` in `lib/scratch-path.mjs`, named `bisect-<sha7>.diff` and `bisect-<sha7>.log`; a fallback writes only the log, named `bisect-head.log`. (exo decided)
13. `--good` starting with `-`, not resolving through `git rev-parse --verify --end-of-options <ref>^{commit}`, or not an ancestor of HEAD → usage error, exit 2; every git call passes an argument array, never a shell string, except the Decision 6 bisect command. (exo decided)
14. Trigger: find-cause runs the script before `exo:locate-code` and before dispatching the investigator, only when the report says the behavior worked before and one command reproduces it. Exit 0 → its `First bad:` and `Diff:` lines go into the investigator prompt and the handoff; exit 1 → `First bad: none`, loop unchanged. (exo decided)
15. Handoff gets a `First bad` field directly before `Hypotheses`; loop Step 3 treats a `First bad` commit's hunks as the first inputs to remove. (exo decided)
16. The `SKILL.md` edit is one short clause in step a, because the body has 26 tokens of headroom under its 750-token ceiling; the run rule lives in `skills/find-cause/investigator-prompt.md`, which step b already opens. (exo decided)
17. `Land: local`, no question; the repo's `.claude/CLAUDE.md` sets it. (exo decided)

## Non-goals
- No good ref from CI history, from a "worked on <date>" phrase or from the last tag (`skills/find-cause/scripts/bisect.mjs`).
- No change to `exo:solve-hard` (`agents/solve-hard.md`) or to build's bug fixer (`skills/build/bug-fixer-prompt.md`) beyond the handoff field they already read.
- No change to `lib/red-green.mjs`, `lib/stall-guard.mjs` or `hooks/run-stall-guard.mjs`; the script only imports them.
- No bisect of uncommitted changes: the working tree's edits are outside history (`skills/find-cause/scripts/bisect.mjs`).

## Assumptions
- Source material: `.exo/ideas2/ranking.md` section 3 and `.exo/ideas2/refute2/K2.md`, `S3.md`; the closest tools are skill-issue `bisect` (model-driven, good ref from a two-week window, main checkout with stash), aiwg `regression-bisect` (last green CI build, clean checkout) and the culprit MCP server (scripted, worktree per probe, user-supplied good ref). This design takes culprit's worktree isolation and skip handling and adds the automatic good ref and the handoff field.
- This spec ran unattended: every step that dispatches `exo:locate-code`, `exo:find-open-points` or `exo:fetch-docs` ran inline by the lead instead; no outside fact was fetched beyond the source material.
- code: `runInWorktree({ root, base, command, runs, timeoutMs })` in `lib/red-green.mjs` returns `{ status: 'green' | 'red' | 'error', output, sha }` and removes its temporary worktree.
- code: `runGuarded({ command, seconds })` in `lib/stall-guard.mjs` returns `STALL_EXIT` (124) after `EXO_STALL_MS` without output.
- code: `skills/build/scripts/land-task.mjs` writes `Proof: <command>: pass (exit 0)` and ``Proof: `<command>` -> <outcome>`` lines; hand-written commits use `Proof: <command> → <result>`; the last 400 commit bodies hold 685 `Proof:` lines.
- code: `verify/checks/script-help.mjs` finds the new entry point by its `isMain(` call; `verify/checks/skill-scripts.mjs` checks that every `scripts/bisect.mjs` link resolves.
- code: `verify/checks/body-budgets.mjs` caps `skills/find-cause/SKILL.md` at 750 tokens with 26 left; `verify/checks/shared-contracts.mjs` pins two find-cause step a and step 7 sentences, which stay verbatim.
- assume: git keeps `refs/bisect/*` and `BISECT_*` per worktree (git 2.54.0 here), so a bisect in the temporary worktree leaves the main checkout's bisect state empty.
- assume: a repo with no `refs/remotes/origin/HEAD`, such as the test fixture, skips the merge-base candidate and goes on to the doubling candidates.
- Open points step ran inline: no point needs the user; the two `assume` points above and below are its output.
- assume: an exit 126 or 127 at an old commit means a setup failure, not the regression, so it skips.

## Acceptance
- Given a temporary repo whose third of five commits breaks `node check.mjs`, `node bisect.mjs --repro "node check.mjs"` prints `First bad: <third sha>`, a `Diff:` path that exists, at most 30 lines, and exits 0. Task 1.
- A commit body `Proof: node check.mjs → pass` on the second commit makes the output's `Good:` line name that commit with `(proof trailer)`. Task 1.
- A repro that passes at HEAD prints `Bisect: no failure at HEAD`; one that alternates pass and fail prints `Bisect: flaky repro`; both exit 1. Task 1.
- `--good -x` exits 2; after every case the fixture's `git status --porcelain`, HEAD and `git worktree list` match the state before the run. Task 1.
- `skills/find-cause/references/handoff.md` lists `First bad` before `Hypotheses`, the investigator prompt carries a `First bad:` line, and `npm run validate:static` stays clean with the find-cause body within its ceiling. Task 2.
- `CHANGELOG.md` holds the line under `## Unreleased` `### Added`. Task 3.
- `npm run check` ends `FAIL=0 WARN=0 UNRUN=0`. Success criterion.

## Manual checks
- On a real regression in some repo, `/exo:find-cause` writes a handoff in `.exo/debug/` whose `First bad` line names the commit that broke it.

## Plan basis
Repository: /Users/thomash/Documents/Code/personal/plugins/exo
Branch: bisect-first-find-cause
Worktree setup: none
Land gate: npm run validate:static
Land: local
Commit: feat(find-cause): bisect a regression before investigating
Lint: none
App: none
Allow: none

## Success criterion
`npm run check`
Red: none (each task's Proof proves its own red; the full check passes on the base)
Product run: none (exo ships no bin and no start script; Task 1's test runs the script on a real git repo)

## Checkpoint
- Blocks first: Task 1.
- Parallel: none.
- Shared state: `skills/find-cause/scripts/bisect.mjs` output lines (Tasks 1, 2), serialized by Depends on.
- Smallest safe split: the script with its test, then the find-cause wording, then the changelog line.

## Tasks
### Task 1: feat(find-cause): add a bisect script that names a regression's first bad commit
Depends on: none | Files: `skills/find-cause/scripts/bisect.mjs`, `tests/find-cause-bisect.test.mjs` | Data: one script per Decisions 1-13 printing the Decision 10 lines or one Decision 11 line, its test building temporary git repos with `node:test` for the Acceptance cases of Task 1 | Risk: security boundary | Boundary: in a `--good` ref that resolves to an ancestor of HEAD and a repro run only inside a temporary worktree | out a `--good` value starting with `-` or not an ancestor of HEAD, and any change to the fixture checkout, its HEAD or its worktree list | test tests/find-cause-bisect.test.mjs | Proof: node --test tests/find-cause-bisect.test.mjs
### Task 2: feat(find-cause): hand the investigator the bisect result
Depends on: 1 | Files: `skills/find-cause/SKILL.md`, `skills/find-cause/investigator-prompt.md`, `skills/find-cause/references/handoff.md`, `skills/find-cause/references/loop.md`, `lib/model-kinds.json`, `verify/checks/reference-tables.mjs`, `verify/model-kinds.mjs`, `tests/model-kinds.test.mjs`, `CONTRIBUTING.md` | Data: a step a clause pointing to `investigator-prompt.md` per Decision 16, a pre-fill rule there running `node "${CLAUDE_SKILL_DIR}/scripts/bisect.mjs" --repro "<command>"` per Decision 14 plus a `First bad: <bisect.mjs First bad and Diff lines, or none>` line in its text block, a `First bad` field before `Hypotheses` in the handoff, and Step 3's first-input rule per Decision 15, each in `condition → action` form, leaving the `lib/model-kinds.json` match text, the `verify/checks/reference-tables.mjs` owner rows, `verify/model-kinds.mjs`, `tests/model-kinds.test.mjs` and `CONTRIBUTING.md` unchanged | Evidence: none (new wiring for a new script; no benchmark case covers a regression bisect) | Proof: grep -q 'First bad' skills/find-cause/references/handoff.md && grep -q 'scripts/bisect.mjs' skills/find-cause/investigator-prompt.md && grep -q 'First bad' skills/find-cause/references/loop.md && grep -q 'bisect' skills/find-cause/SKILL.md
### Task 3: docs(changelog): record bisect-first find-cause
Depends on: 1, 2 | Files: `CHANGELOG.md` | Data: one line under `## Unreleased` in `### Added`: `find-cause runs skills/find-cause/scripts/bisect.mjs on a regression with a one-command repro before any model investigates: it picks the good commit from the newest matching Proof line, the merge-base or a doubling search, bisects in a temporary worktree and hands the investigator a First bad commit with its diff; a flaky or unbisectable repro falls back to the usual loop` | Evidence: none (changelog line only) | Proof: grep -qF 'skills/find-cause/scripts/bisect.mjs' CHANGELOG.md
