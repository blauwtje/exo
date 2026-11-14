## Goal
exo reaches the level of Karpathy's repositories and of 50k+ star agent tooling: easy, fast, cheap and good for any user, in five measured wishes.

## Verdict
Verdict: go
Objection: exo's own share of the context at first compaction is about 30% and its files already meet most size traits, so the gain has to come from fewer agent hops and deleted parts, not from new rules (`.exo/karpathy-level/context.md` (c), `.exo/karpathy-level/karpathy.md`).

## Decisions
Evidence root: `.exo/karpathy-level/` (gate-repo.md, gate-web.md, code-review-test-2.md, code-review-test-3.md, context.md, ideas.md, karpathy.md, dead-code.md).
Shared cause: each stage passes work through more agent turns and returned text than the catch it buys; the fix is to use the platform's part, delete exo's copy, return a verdict and a path.
1. The gate review step calls the built-in `code-review` skill through the Skill tool from the gate fork with args `<level> <branch>`: `medium` when a landed task has a `Risk:` line, else `low`; a branch target is required. Same head: review-branch 187,929 tokens, 87 s, 4 defects; built-in low 26k, 13 s; medium 30,004, 37 s, 10 findings covering every defect that got a fix commit. Rejected: slimmed review-branch (about 6 times the tokens), no review. (exo decided)
2. The gate keeps `context: fork`: a fork turn re-reads about 20k tokens, a lead turn about 100k. (exo decided)
3. `verify.mjs` writes its own full log and prints only `PASS` and `FAIL` lines, so the gate runs it in one foreground call. (exo decided)
4. The gate report drops `question` findings; a finding goes back to `exo:build`. With no `code-review` skill listed, the gate says no review ran and still offers `ship`. (exo decided)
5. `agents/review-branch.md` keeps its name and loses `## Review` and `## Report`; its description becomes "Dispatched by research only." The review-only kinds and the review dispatch or parse plumbing in build and gate scripts go, with their tests; a file that only names `review-branch` and holds no review logic is left alone. (exo decided)
6. `agents/research-worker.md` and `skills/spec/references/worker-modes.md` web mode return 10 lines, not 40, ending on `Result: <path>`; findings stay in the result file. (exo decided)
7. `skills/spec/references/step-rules.md` step 4 allows up to four research workers, not eight. (exo decided)
8. SessionStart keeps firing on `compact`, because the summary drops the rules T1 to T4. (exo decided)
9. Adopted ideas, each an edit of an existing rule, no new script:
   - 1/10 and 2/25: search session transcripts for a mistake and record the count before adding its `docs/failures.md` line. Engineers: Brian Douglas (Paper Compute), Ayush Bhardwaj (Allos AI), Ben Holmes (Warp).
   - 1/19: `lib/agent-modes/task-modes.md` batch rule: a batch result names each input item and the lead compares it with the input list. Engineers: Dmitry Buykin (Maersk), Natalia Connolly and Kevin Madura (AlixPartners).
   - 2/5: `docs/scorecard.md` gets model and effort columns and the release eval step in `CONTRIBUTING.md` records a second setting with `--model`. Engineers: Lance Martin (Anthropic), Zach Lloyd (Warp).
   (exo decided)
10. Not adopted: 2/12 skill ablation (`claude plugin eval --ablation` works per plugin only, needs new tooling; left open), 1/18 and 2/24 (exo already equal), 11 single-source ideas including 2/13. (exo decided)
11. Idea 2/13 against `exo:build improve`: asked, no answer; default `exo:build improve` stays (one source, Anthropic and Warp practise the opposite). No task changes improve. (exo decided)
12. Karpathy style is one short section in `skills/edit-skills/references/instruction-style.md`, replacing overlapping text, no new page or check: first use in at most 4 commands, 0 runtime dependencies, entry skill at most 120 lines, skill file at most 10 KB, source file at most 700 lines, one done command per task, at most 5 prohibition bullets per instruction file, delete before adding. (exo decided)
13. Delete `lib/statistics.mjs`, `verify/prose-style.mjs`, `verify/checks/reference-chain.mjs`, and `skills/build/scripts/run-tail-parse.mjs` with its test and import; `verify/user-read.mjs` stays. (exo decided)
14. Each changed skill, agent, hook or check gets its `docs/failures.md` line first: gate review 278k tokens median with 5 of 8 runs leading to no fix; re-review rounds 2 and 4 of watch-tiktok-speed at 0.4 to 0.7M tokens with no code commit; subagent returns 15% of the context at first compaction. (exo decided)

## Non-goals
- Prohibition counts over 5 in `output-styles/adhd.md`, `skills/watch/SKILL.md`, `skills/save-session/SKILL.md`, `agents/orchestrator.md`; test files over 700 lines; the per-task `Proof:` half of `verify.mjs`; the gate fork's model; the 36 of 40 checks that never fired in 55 logs; stale `CHANGELOG.md` lines (the lead fixes them). Reported only.
- Renaming `review-branch` to `claims-judge` (file, `lib/model-kinds.json`, callers, tests, docs) is a reported follow-up.
- Skill ablation (2/12) and any change to `exo:build improve`.

## Assumptions
- [code] The 26 files that name `review-branch` outside docs/specs and CHANGELOG.md are listed in Task 2 by `grep -rl` at build time.

## Acceptance
- Wish 2, gate: before median 422k tokens, 14 tool calls, 271 s per gate run; review step 278k tokens, 85 s. Target: review step under 60k, whole gate under 250k, measured in Manual checks.
- Wish 4, context: worker return cap 40 -> 10 lines (Task 3); spec research workers 8 -> 4 (Task 3); subagent returns 25.3k tokens per spec session (15.0%) before, measured after with `measure-context.mjs` on the first spec session that runs the new exo.
- Wish 1, ideas: 18 open -> 4 adopted in 3 rule edits (Task 4), 1 open (2/12), 13 closed with a named reason.
- Wish 3 and 5: traits passed out of the 8 in decision 12 before and after (Task 5); tracked files and lines before and after with `git ls-files | wc -l` and `git ls-files -z | xargs -0 cat | wc -l` (Tasks 2 and 6); agents' review text 36 lines -> claims-only in `agents/review-branch.md` (Task 2).
- All: Success criterion; before `PASS=51 FAIL=0 WARN=0 UNRUN=0` (`.exo/check-karpathy-level-before.log`).

## Manual checks
- Run the gate once on the `karpathy-level` branch with the commands in `.exo/karpathy-level/gate-repo.md` (c) and see the review step under 60k tokens and the whole gate under 250k tokens.

## Plan basis
Repository: .
Branch: karpathy-level
Worktree setup: none
Land gate: npm run validate:static
Land: local
Commit: feat(exo): reach karpathy level with the built-in reviewer, smaller worker returns and deletions
Lint: none
App: none
Allow: none

## Success criterion
`npm run check`
Red: none (each task's Proof proves its own red)
Product run: none (the plugin has no bin or start script)

## Checkpoint
- Blocks first: Task 1.
- Parallel: Tasks 5 and 6.
- Shared state: Tasks 1 and 2 share `skills/gate/SKILL.md`, `skills/gate/scripts/verify.mjs`, `docs/skills/gate.md` and gate tests.
- Smallest safe split: one task per decision group.

## Tasks
### Task 1: feat(gate): review the branch with the built-in code-review skill
Depends on: none | Files: `skills/gate/SKILL.md`, `skills/gate/scripts/verify.mjs`, `tests/gate-verify.test.mjs`, `tests/verify-single-read.test.mjs`, `tests/implementing-push-gate.test.mjs`, `tests/run-tail-protocol.test.mjs`, `evals/gate-skip-review/case.yaml`, `docs/skills/gate.md`, `docs/failures.md` | Data: a gate report of PASS and FAIL lines plus the built-in review findings | Risk: public signature | Evidence: none (the built-in code-review replaces the branch reviewer, measured in the evidence root code-review-test-3.md) | Proof: node --test tests/gate-verify.test.mjs
### Task 2: refactor(agents): drop the branch review from review-branch
Depends on: 1 | Files: `agents/review-branch.md`, `lib/model-kinds.json`, `verify/model-kinds.mjs`, `skills/build/scripts/run-session-args.mjs`, `skills/build/scripts/run-plan-provider.mjs`, `verify/checks/run-contract.mjs`, `docs/behaviour/agents.md`, `README.md`, `CONTRIBUTING.md`, `tests/agents.test.mjs`, `tests/agent-effort.test.mjs`, `tests/model-kinds.test.mjs`, `tests/run-plan-provider-fallback.test.mjs`, `tests/check-run-contract.test.mjs`, `tests/deep-tier.test.mjs` | Data: one agent file holding only the claims judge, with the review kinds removed from the kind table | Risk: public signature | Red: none (the agent text and tables shrink, the tests read them) | Evidence: none (the claims judge text stays) | Proof: node --test tests/agents.test.mjs tests/model-kinds.test.mjs tests/agent-effort.test.mjs tests/check-run-contract.test.mjs
### Task 3: refactor(agents): cap worker returns at 10 lines and spec research workers at four
Depends on: 2 | Files: `agents/research-worker.md`, `verify/budgets.mjs`, `lib/model-kinds.json`, `tests/model-kinds.test.mjs`, `CONTRIBUTING.md`, `tests/agents.test.mjs`, `tests/spec-gate-text.test.mjs`, `skills/spec/references/worker-modes.md`, `skills/spec/references/step-rules.md`, `docs/failures.md`, `tests/worker-size.test.mjs`, `tests/worker-waits.test.mjs` | Data: a 10-line return ending on `Result: <path>` | Red: none (the caps are text the tests read) | Evidence: none (caps cut measured subagent return share, context.md) | Proof: node --test tests/worker-size.test.mjs tests/worker-waits.test.mjs
### Task 4: docs(rules): adopt three idea edits from the ideas list
Depends on: 3, 6 | Files: `.claude/CLAUDE.md`, `verify/model-kinds.mjs`, `tests/model-kinds.test.mjs`, `tests/agents.test.mjs`, `tests/fixer-mark.test.mjs`, `tests/worker-waits.test.mjs`, `lib/agent-modes/task-modes.md`, `docs/scorecard.md`, `CONTRIBUTING.md` | Data: three edited rule lines and two scorecard columns | Evidence: none (edits come from ideas.md rows 1/10, 2/25, 1/19, 2/5) | Proof: grep -q 'model' docs/scorecard.md && grep -q 'input' lib/agent-modes/task-modes.md
### Task 5: docs(style): add the Karpathy style section to instruction-style
Depends on: none | Files: `skills/edit-skills/references/instruction-style.md` | Data: one section of eight measurable traits | Evidence: none (traits come from karpathy.md table (c)) | Proof: grep -c 'at most 120 lines' skills/edit-skills/references/instruction-style.md
### Task 6: chore(repo): delete files nothing reaches
Depends on: none | Files: `lib/statistics.mjs`, `verify/prose-style.mjs`, `verify/checks/reference-chain.mjs`, `skills/build/scripts/run-tail-parse.mjs`, `tests/fixer-mark.test.mjs` | Data: four removed files and one test import | Risk: dependency | Proof: node --test tests/fixer-mark.test.mjs
