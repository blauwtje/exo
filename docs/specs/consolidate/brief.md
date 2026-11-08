# Consolidate exo skills and agents

## Goal
exo ships 9 skills and 5 agents, and every multi-step skill runs in the orchestrator so only its verdict reaches the main session.

## Verdict
Verdict: go
Objection: `agent: orchestrator` under `context: fork` is unverified for plugin agents; task 11 proves it and falls back to an orchestrator dispatch from a launcher body when it fails.

## Decisions
1. Merge map, skills (exo decided): spec <- spec, research, ideate, check-docs; build <- build, run-plan, refactor, improve, design-ui; gate <- gate, review; find-cause <- find-cause; ship <- ship, file-issues; write-docs <- write-docs; edit-skills <- edit-skills, prompt, remember; watch <- watch; save-session and configure stay separate; start and route-skills are deleted, their still-read files move under lib/references and lib/assets. 23 -> 10.
2. Merge map, agents (exo decided): orchestrator <- orchestrator; task-runner <- task-runner; build-task <- build-task, solve-hard, fix-review; research-worker <- research-worker, ideate-worker, fetch-docs, locate-code, find-open-points; review-branch <- review-branch, claim-judge. 12 -> 5.
3. A folded skill folder is deleted: its body moves to `<owner>/references/<name>.md` and its scripts to `<owner>/scripts/`, by the task 7 script, and the owner SKILL.md names it as a mode in its References table (exo decided).
4. Routing rule: "Unclear: spec. Clear: build. Broken: find-cause. Leaving the machine: ship. About exo: save-session or configure." (exo decided).
5. Launchers: build, gate, find-cause, ship, write-docs, edit-skills and watch carry `context: fork` and `agent: orchestrator`; spec asks in main and dispatches the orchestrator once for steps 4 to 8; save-session runs inline (exo decided).
6. Budgets: main gets a launcher body under 300 tokens and a verdict of at most 5 lines; the orchestrator keeps the 45k, 60k and 75k limits, a retry cap and a timeout per worker; a worker gets a brief under 2k tokens and returns one verdict line plus a result path (exo decided).
7. The orchestrator's named result file is always writable; the refusal is fixed at its source (exo decided).
8. Every rejected alternative is in `docs/specs/consolidate/decisions.md` (exo decided).

## Non-goals
- No change to `benchmarks/`, `CHANGELOG-archive.md` or old specs under `docs/specs/`.
- No change to hook timing, the per-task Land gate or the content of `skills/route-skills/references/`, which only moves under `skills/build/`.

## Assumptions
- [code] Effort per brief kind already exists: `hooks/agent-effort.mjs` and `lib/model-kinds.json` read `exo-kind:`.
- [code] The refusal text was seen from the harness Write tool on a file named `report.md` in a subagent.
- [docs] A fork skill sees no main history, gets the skill text as its prompt and returns a summary; `agent: exo:orchestrator` is likely but unverified, and task 11 proves it.

## Acceptance
- `ls skills/*/SKILL.md | wc -l` prints 9, `ls -d skills/*/ | wc -l` prints 9 and `ls agents | wc -l` prints 5 (Tasks 2 to 10).
- Each launcher SKILL.md holds `context: fork` (Task 11).
- Skill plus agent bytes always loaded shrink against main and `npm run check` holds (Success criterion).

## Manual checks
- Start a new session, type "plan this change", and see spec ask its first question without any agent output in the chat.
- Run a small build and see one short verdict, not worker reports, in the chat.

## Plan basis
Repository: /repo
Branch: spec/consolidate
Worktree setup: none
Land gate: npm run validate:static
Land: local
Commit: refactor(skills): consolidate exo into 9 skills and 5 agents
Lint: none
App: none
Allow: none

## Success criterion
`npm run check` passes.
Red: none (each task's Proof shows its own red; the suite passes on the base)
Product run: none (exo is a plugin with no bin or start script)

## Checkpoint
- Blocks first: Task 1.
- Parallel: none.
- Shared state: `lib/model-kinds.json`, `tests/agents.test.mjs`, `CONTRIBUTING.md` and `verify/reference-owner-rows.txt` are edited by several tasks, so the tasks run in order.
- Smallest safe split: one merge group per task, each with its callers and tests.

## Tasks

### Task 1: chore(hooks): keep the orchestrator's named result file writable
Depends on: none | Files: `agents/orchestrator.md`, `hooks/dispatch-edit.mjs`, `lib/guard-rules.mjs`, `tests/hooks.test.mjs`, `tests/guard-rules.test.mjs`, `tests/agent-effort.test.mjs` | Data: the brief's `Result:` path, allowed by the Write guard that refused it, found first by grepping hooks, lib, skills scripts and agents for report, summary and findings guards; when the harness owns the text, result files take a name without report, summary or findings | Proof: node --test tests/hooks.test.mjs

Commit:
```bash
git commit -m "docs(spec): record the consolidate plan tasks and the prune paths as landed"
```

### Task 2: refactor(agents): fold ideate-worker, fetch-docs, locate-code and find-open-points into research-worker
Depends on: 1 | Files: `agents/research-worker.md`, `agents/ideate-worker.md`, `agents/fetch-docs.md`, `agents/locate-code.md`, `agents/find-open-points.md`, `lib/model-kinds.json`, `hooks/agent-effort.mjs`, `harnesses/codex/generate.mjs`, `lib/context-decisions.mjs`, `tests/agents.test.mjs`, `tests/model-kinds.test.mjs`, `verify/model-kinds.mjs`, `tests/agent-effort.test.mjs`, `verify/budgets.mjs` | Data: one agent file whose brief line `Sources: repo, web, docs or brief` picks the mode of each folded agent; the folded agent files are deleted, so fetch-docs headroom no longer matters | Evidence: none (merge only; Success criterion and Manual checks measure it) | Red: none (the merge keeps behavior; the Proof shows the merged tests still pass) | Proof: node --test tests/agents.test.mjs tests/model-kinds.test.mjs tests/agent-effort.test.mjs

Commit:
```bash
git commit -m "docs(spec): record the consolidate plan tasks and the prune paths as landed"
```

### Task 3: refactor(agents): repoint the hook rules and session tests to research-worker
Depends on: 2 | Files: `hooks/dispatch-rules.md`, `hooks/session-rules.md`, `tests/hooks.test.mjs`, `tests/agent-effort.test.mjs`, `tests/session-start-codex.test.mjs`, `tests/session-start-source.test.mjs` | Data: every mention of ideate-worker, fetch-docs, locate-code and find-open-points in the hook rules names research-worker with a `Sources:` line | Evidence: none (rename only; Success criterion measures it) | Red: none (the rename keeps behavior; the Proof shows the tests still pass) | Proof: node --test tests/hooks.test.mjs tests/session-start-source.test.mjs

Commit:
```bash
git commit -m "docs(spec): record the consolidate plan tasks and the prune paths as landed"
```

### Task 4: refactor(agents): repoint the skill references and their tests to research-worker
Depends on: 3 | Files: `skills/spec/references/map-locate.md`, `skills/spec/references/brief.md`, `skills/build/references/no-spec.md`, `skills/find-cause/investigator-prompt.md`, `tests/brief-denials.test.mjs`, `tests/brief-reads-items.test.mjs`, `tests/brief-result-tools.test.mjs`, `tests/improve-round.test.mjs`, `tests/improve-setup.test.mjs`, `tests/spec-gate-text.test.mjs` | Data: every mention of the folded agents in the skill references names research-worker with a `Sources:` line | Evidence: none (rename only; Success criterion measures it) | Red: none (the rename keeps behavior; the Proof shows the tests still pass) | Proof: node --test tests/brief-denials.test.mjs tests/spec-gate-text.test.mjs

Commit:
```bash
git commit -m "docs(spec): record the consolidate plan tasks and the prune paths as landed"
```

### Task 5: refactor(agents): fold claim-judge into review-branch and solve-hard and fix-review into build-task
Depends on: 4 | Files: `agents/review-branch.md`, `agents/claim-judge.md`, `agents/build-task.md`, `agents/solve-hard.md`, `agents/fix-review.md`, `lib/model-kinds.json`, `lib/refusal-handlers.mjs`, `skills/gate/SKILL.md`, `skills/gate/scripts/gate-step.mjs`, `skills/gate/scripts/gate-repair.mjs`, `skills/find-cause/SKILL.md`, `skills/research/references/verification.md`, `skills/ship/references/pr-comments.md`, `skills/build/references/agent-cases.md`, `tests/agents.test.mjs`, `tests/gate-step.test.mjs`, `tests/model-kinds.test.mjs`, `tests/refusal-handlers.test.mjs`, `verify/model-kinds.mjs`, `verify/checks/reference-tables.mjs`, `tests/benchmark-agent-tier-task-runner.test.mjs`, `tests/fixer-mark.test.mjs` | Data: gate body trimmed to leave over 100 tokens of headroom; build-task takes effort from the brief's `exo-kind:` line, review-branch takes a claims or branch input | Evidence: none (merge only; Success criterion measures it) | Red: none (the merge keeps behavior; the Proof shows the merged tests still pass) | Proof: node --test tests/agents.test.mjs tests/gate-step.test.mjs

Commit:
```bash
git commit -m "docs(spec): record the consolidate plan tasks and the prune paths as landed"
```

### Task 6: refactor(spec): fold research, ideate and check-docs into spec modes
Depends on: 5 | Files: `skills/spec/SKILL.md`, `skills/research/SKILL.md`, `skills/ideate/SKILL.md`, `skills/check-docs/SKILL.md`, `docs/skills/check-docs.md`, `verify/reference-owner-rows.txt`, `verify/checks/shared-contracts.mjs`, `tests/reference-owner-rows.test.mjs`, `verify/checks/reference-tables.mjs`, `tests/spec-verdict.test.mjs` | Data: each folded SKILL.md renamed to MODE.md with `${CLAUDE_SKILL_DIR}` rewritten to its own folder, named as a mode in spec's References table | Evidence: none (merge only; Manual checks measure routing) | Red: none (the merge keeps behavior; the Proof shows the merged tests still pass) | Proof: node --test tests/reference-owner-rows.test.mjs

Commit:
```bash
git commit -m "docs(spec): record the consolidate plan tasks and the prune paths as landed"
```

### Task 7: refactor(verify): add the fold map, its check and the one fold script
Depends on: 6 | Files: `verify/fold-map.json`, `verify/fold-skills.mjs`, `verify/checks/folded-names.mjs`, `verify.mjs`, `tests/folded-names.test.mjs`, `tests/verify-single-read.test.mjs`, `tests/principles-check.test.mjs`, `skills/spec/**`, `skills/research/**`, `skills/ideate/**`, `skills/check-docs/**`, `docs/skills/research.md`, `docs/skills/ideate.md`, `.claude/CLAUDE.md`, `docs/principles/README.md` plus every file the script rewrites | Data: `verify/fold-map.json` maps each folded skill and agent to its owner (decisions 1 and 2), with not-yet-folded entries marked `pending`; `node verify/fold-skills.mjs --from <name> --into <owner>` deletes the folder, moves the body to `<owner>/references/<name>.md` and the scripts to `<owner>/scripts/`, rewrites `${CLAUDE_SKILL_DIR}` to `${CLAUDE_PLUGIN_ROOT}/skills/<owner>/`, rewrites old skill and agent names and paths in every file (about 54 files, 43 of them naming folded agents), appends the owner References row and the `verify/reference-owner-rows.txt` row, deletes `docs/skills/<name>.md`, flips the map entry from pending and prints what it left unmatched; the check fails on any `exo:<folded>`, any `skills/<folded>/` path and any `MODE.md`, and leaves out `CHANGELOG*`, `benchmarks/`, `docs/benchmarks/`, `docs/specs/` and the `labels` in `lib/model-kinds.json`; this task runs the script for research, ideate and check-docs, moving the MODE.md files task 6 landed | Evidence: none (mechanical move; the check and its test prove it) | Red: none (the check is new; its test builds a fixture repo naming an old skill and sees the check fail) | Proof: node --test tests/folded-names.test.mjs tests/reference-owner-rows.test.mjs tests/spec-verdict.test.mjs tests/verify-single-read.test.mjs tests/principles-check.test.mjs

Commit:
```bash
git commit -m "docs(spec): record the consolidate plan tasks and the prune paths as landed"
```

### Task 8: refactor(build): fold run-plan, refactor, improve and design-ui into build modes
Depends on: 7 | Files: `skills/build/SKILL.md`, `skills/run-plan/SKILL.md`, `skills/refactor/SKILL.md`, `skills/improve/SKILL.md`, `skills/design-ui/SKILL.md`, `docs/skills/run-plan.md`, `docs/skills/refactor.md`, `docs/skills/improve.md`, `docs/skills/design-ui.md`, `verify/reference-owner-rows.txt`, `verify/module-size-ceilings.txt`, `verify/checks/git-helper.mjs`, `tests/reference-owner-rows.test.mjs`, `verify/budgets.mjs`, `lib/model-kinds.json`, `tests/model-kinds.test.mjs`, `verify/model-kinds.mjs`, `verify/checks/reference-tables.mjs`, `tests/improve-round.test.mjs`, `tests/run-plan-ci.test.mjs` | Data: run `node verify/fold-skills.mjs --from <name> --into build` for run-plan, refactor, improve and design-ui, for prompt and remember only; start and route-skills are deleted by hand and their still-read files move to skills/build; `docs/skills/<folded>.md` deleted, its user-facing lines move to the owner page in task 13; `verify/module-size-ceilings.txt` rows return to their values before 123470fd | Evidence: none (merge only; Manual checks measure routing) | Red: none (the merge keeps behavior; the Proof shows the merged tests still pass) | Proof: node --test tests/reference-owner-rows.test.mjs tests/improve-round.test.mjs tests/run-plan-ci.test.mjs tests/model-kinds.test.mjs

Commit:
```bash
git commit -m "docs(spec): record the consolidate plan tasks and the prune paths as landed"
```

### Task 9: refactor(gate): fold review into gate and file-issues into ship
Depends on: 8 | Files: `skills/gate/SKILL.md`, `skills/review/SKILL.md`, `skills/ship/SKILL.md`, `skills/file-issues/SKILL.md`, `skills/spec/SKILL.md`, `docs/skills/review.md`, `docs/skills/file-issues.md`, `verify/reference-owner-rows.txt`, `tests/file-issues-duplicates.test.mjs`, `tests/review-resolve-target.test.mjs`, `tests/reference-owner-rows.test.mjs`, `verify/checks/reference-tables.mjs`, `tests/spec-verdict.test.mjs` | Data: run `node verify/fold-skills.mjs` for review into gate and file-issues into ship, for prompt and remember only; start and route-skills are deleted by hand and their still-read files move to skills/build; `docs/skills/<folded>.md` deleted, its user-facing lines move to the owner page in task 12 | Evidence: none (merge only; Manual checks measure routing) | Red: none (the merge keeps behavior; the Proof shows the merged tests still pass) | Proof: node --test tests/file-issues-duplicates.test.mjs tests/reference-owner-rows.test.mjs tests/review-resolve-target.test.mjs tests/spec-verdict.test.mjs

Commit:
```bash
git commit -m "docs(spec): record the consolidate plan tasks and the prune paths as landed"
```

### Task 10: refactor(skills): fold prompt and remember into edit-skills and delete start and route-skills, keeping save-session and configure
Depends on: 9 | Files: `skills/edit-skills/SKILL.md`, `skills/prompt/SKILL.md`, `skills/remember/SKILL.md`, `skills/start/SKILL.md` (deleted), `skills/route-skills/SKILL.md` (deleted), `skills/build/references/`, `.claude-plugin/plugin.json`, `hooks/session-end.mjs`, `hooks/session-routing.md`, `docs/skills/prompt.md`, `docs/skills/remember.md`, `docs/skills/configure.md`, `docs/skills/save-session.md`, `docs/skills/route-skills.md`, `verify/reference-owner-rows.txt`, `tests/session-end.test.mjs`, `tests/reference-owner-rows.test.mjs`, `verify/budgets.mjs`, `verify/checks/reference-tables.mjs`, `tests/routing-eval.test.mjs` | Data: run `node verify/fold-skills.mjs` for prompt and remember into edit-skills and for prompt and remember only; start and route-skills are deleted by hand and their still-read files move to skills/build; `docs/skills/<folded>.md` deleted, its user-facing lines move to the owner page in task 13; `hooks/session-routing.md` holds the one routing rule | Evidence: none (merge only; Manual checks measure routing) | Red: none (the merge keeps behavior; the Proof shows the merged tests still pass) | Proof: node --test tests/hooks.test.mjs tests/reference-owner-rows.test.mjs tests/session-end.test.mjs tests/routing-eval.test.mjs

Commit:
```bash
git commit -m "docs(spec): record the consolidate plan tasks and the prune paths as landed"
```

### Task 11: feat(skills): run the seven launcher skills in the orchestrator
Depends on: 10 | Files: `skills/build/SKILL.md`, `skills/gate/SKILL.md`, `skills/find-cause/SKILL.md`, `skills/ship/SKILL.md`, `skills/write-docs/SKILL.md`, `skills/edit-skills/SKILL.md`, `skills/watch/SKILL.md`, `tests/agent-effort.test.mjs`, `tests/benchmark-flow-unit.test.mjs`, `skills/build/references/tail.md`, `skills/build/references/run-loop.md`, `agents/orchestrator.md`, `tests/skill-text.test.mjs`, `verify/checks/reference-tables.mjs` | Data: `context: fork` and `agent: orchestrator` frontmatter on 7 launchers, each body under 300 tokens, and gate trimmed to leave over 100 tokens of body headroom; the plain-dispatch fallback applies if the proof of `agent: orchestrator` fails; this task alone trims launcher bodies (including gate), and the 300-token cap binds only the fallback path: when the fork proof passes the References table stays in the body, and when it fails the table moves to references/index.md; a forked build returns "Next: gate <plan>" (or "Next: find-cause <report>") as its last verdict line and main runs that skill without asking; run-loop.md asks for CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH 3+ under fork; run-loop step 1 skips --find-only when --plan is named and its basis names Repository and Branch; the build launcher's Result is the run state, so the orchestrator writes no handover template for build; the proof also shows the forked orchestrator's Workers cap and effort, which the Agent hook never sees for a fork | Evidence: none (flow change; Manual checks measure the main-session verdict) | Proof: node --test tests/skill-text.test.mjs tests/agent-effort.test.mjs tests/benchmark-flow-unit.test.mjs
Build body ceiling: set the build body ceiling to the measured 930, because the fork proof shows the launcher body loads in the forked orchestrator, which needs the References table there.

Commit:
```bash
git commit -m "docs(spec): record the consolidate plan tasks and the prune paths as landed"
```

### Task 12: feat(spec): hand spec steps 4 to 8 and the orchestrator budgets to one dispatch
Depends on: 11 | Files: `skills/spec/SKILL.md`, `verify/checks/reference-tables.mjs`, `agents/orchestrator.md`, `hooks/dispatch-rules.md`, `verify/budgets.mjs`, `lib/model-kinds.json`, `verify/model-kinds.mjs`, `tests/model-kinds.test.mjs`, `tests/agent-effort.test.mjs`, `tests/hooks.test.mjs`, `tests/session-start-codex.test.mjs`, `tests/spec-verdict.test.mjs` | Data: spec steps 4 to 8 as one orchestrator dispatch, and the orchestrator budgets, retry cap, timeout and inline rule for small work | Evidence: none (flow change; Manual checks measure the main-session verdict) | Proof: node --test tests/spec-verdict.test.mjs tests/agent-effort.test.mjs tests/model-kinds.test.mjs tests/hooks.test.mjs tests/session-start-codex.test.mjs

Commit:
```bash
git commit -m "docs(spec): record the consolidate plan tasks and the prune paths as landed"
```

### Task 13: docs: list the 10 skills, 5 agents and the routing rule
Depends on: 12 | Files: `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `docs/skills/spec.md`, `docs/skills/build.md`, `docs/skills/gate.md`, `docs/skills/ship.md`, `docs/skills/edit-skills.md`, `tests/benchmark-ideate-worker-score.test.mjs`, `tests/pressure-criteria.test.mjs`, `tests/principles-check.test.mjs` | Data: one skill table and one agent table, and one `### Changed` line under `## Unreleased`; each owner page gets one `## Modes` section naming its folded skills | Proof: grep -q "Unclear: spec" README.md && node verify/checks/folded-names.mjs

Commit:
```bash
git commit -m "docs(spec): record the consolidate plan tasks and the prune paths as landed"
```

### Task 14: prune: remove unused files, duplicate rules and unread benchmark results
Depends on: 13 | Files: `benchmarks/results/`, `benchmarks/pressure/`, `benchmarks/review-judges/`, `benchmarks/agent-tier/`, `skills/route-skills/`, `skills/start/`, `skills/run-plan/`, `skills/prompt/`, `skills/file-issues/`, `skills/research/`, `skills/design-ui/`, `skills/improve/`, `skills/refactor/`, `skills/ideate/`, `skills/review/`, `skills/remember/`, `CHANGELOG-archive.md`, `benchmarks/agent-tier.mjs`, `benchmarks/cell-usage.mjs`, `benchmarks/checkpoint-fork.mjs`, `benchmarks/fix-round.mjs`, `benchmarks/ideate-tokens.mjs`, `benchmarks/improve-real.mjs`, `benchmarks/improve-speed.mjs`, `benchmarks/improve-vs-goal.mjs`, `benchmarks/research/grade.mjs`, `benchmarks/review-replay.mjs`, `benchmarks/routing/prompts.json`, `benchmarks/session-stats.mjs`, `benchmarks/suites.json`, `benchmarks/sweep.mjs`, `benchmarks/variants.mjs`, `bump.mjs`, `lib/agent-modes/claims-mode.md`, `lib/agent-modes/task-modes.md`, `lib/assets/handover-template.md`, `lib/brief-denials.mjs`, `lib/kind-labels.mjs`, `lib/live-shells.mjs`, `lib/memory-store.mjs`, `lib/next-stage.mjs`, `lib/read-entries.mjs`, `lib/references/closing.md`, `lib/references/code-standard.md`, `lib/references/context.md`, `lib/references/lean.md`, `lib/references/project-structure.md`, `lib/references/question.md`, `lib/references/user-read-format.md`, `lib/result-file.mjs`, `lib/review-judges.mjs`, `lib/session-pointers.mjs`, `lib/skill-overview.mjs`, `lib/slice-state.mjs`, `lib/worker-size.mjs`, `package.json`, `skills/build/assets/exo-run.yml`, `skills/build/bug-fixer-prompt.md`, `skills/build/drift-repairer-prompt.md`, `skills/build/review-fixer-prompt.md`, `skills/build/scripts/baseline.mjs`, `skills/build/scripts/ci-bundle.mjs`, `skills/build/scripts/ci-plan-path.mjs`, `skills/build/scripts/ci-publish.mjs`, `skills/build/scripts/ci-render.mjs`, `skills/build/scripts/ci-run.mjs`, `skills/build/scripts/deal.mjs`, `skills/build/scripts/fast-check.mjs`, `skills/build/scripts/look.mjs`, `skills/build/scripts/next-task-brief.mjs`, `skills/build/scripts/regions.mjs`, `skills/build/scripts/round.mjs`, `skills/build/scripts/run-session-args.mjs`, `skills/build/scripts/run-session-rules.mjs`, `skills/build/scripts/run-tail.mjs`, `skills/build/scripts/scope.mjs`, `skills/build/scripts/setup.mjs`, `skills/configure/SKILL.md`, `skills/configure/schema.json`, `skills/configure/scripts/settings.mjs`, `skills/edit-skills/references/description.md`, `skills/edit-skills/references/prompt-rules.md`, `skills/edit-skills/references/skill-shape.md`, `skills/edit-skills/scripts/rename-skill.mjs`, `skills/find-cause/fixer-prompt.md`, `skills/find-cause/references/finish.md`, `skills/find-cause/references/loop.md`, `skills/gate/assets/run-report.md`, `skills/gate/references/lessons.md`, `skills/gate/references/repair.md`, `skills/gate/references/review-dispatch.md`, `skills/gate/references/review.md`, `skills/gate/scripts/resolve-target.mjs`, `skills/gate/scripts/review-input.mjs`, `skills/gate/scripts/self-host.mjs`, `skills/save-session/SKILL.md`, `skills/ship/references/ask-menu.md`, `skills/ship/references/fields.md`, `skills/ship/references/overview-extras.md`, `skills/ship/references/pr-merge.md`, `skills/ship/scripts/repo-fields.mjs`, `skills/spec/references/ask-rules.md`, `skills/spec/references/brief-in-an-issue.md`, `skills/spec/references/hand-off.md`, `skills/spec/references/ideate.md`, `skills/spec/references/research.md`, `skills/spec/references/sources.md`, `skills/spec/references/step-rules.md`, `skills/spec/references/templates.md`, `skills/spec/references/verification.md`, `skills/spec/references/worker-modes.md`, `skills/spec/scripts/age-gate.mjs`, `skills/spec/scripts/archive.mjs`, `skills/spec/scripts/block-detect.mjs`, `skills/spec/scripts/browser-render.mjs`, `skills/spec/scripts/claims.mjs`, `skills/spec/scripts/fetch.mjs`, `skills/spec/scripts/khoros-feed.mjs`, `skills/spec/scripts/ledger.mjs`, `skills/spec/scripts/page-text.mjs`, `skills/spec/scripts/plan.mjs`, `skills/spec/scripts/search.mjs`, `skills/spec/scripts/sources/arxiv.mjs`, `skills/spec/scripts/sources/github.mjs`, `skills/spec/scripts/sources/google-sheets.mjs`, `skills/spec/scripts/sources/hn.mjs`, `skills/spec/scripts/sources/http.mjs`, `skills/spec/scripts/sources/index.mjs`, `skills/spec/scripts/sources/pages.mjs`, `skills/spec/scripts/sources/podcast.mjs`, `skills/spec/scripts/sources/reddit.mjs`, `skills/spec/scripts/sources/stackoverflow.mjs`, `skills/spec/scripts/sources/wikipedia.mjs`, `skills/spec/scripts/verify.mjs`, `tests/benchmark-checkpoint-fork.test.mjs`, `tests/benchmark-ideate-fixture.test.mjs`, `tests/benchmark-improve-real-main.test.mjs`, `tests/benchmark-review-judges.test.mjs`, `tests/benchmark-review-replay.test.mjs`, `tests/benchmark-review-stages.test.mjs`, `tests/benchmark-sweep-repeat.test.mjs`, `tests/check-fix-class-load.test.mjs`, `tests/codex-brief-rules.test.mjs`, `tests/context-limit.test.mjs`, `tests/design-regions.test.mjs`, `tests/exo-key.test.mjs`, `tests/fix-rounds.test.mjs`, `tests/fixtures/decided-stream.jsonl`, `tests/ideate-plan.test.mjs`, `tests/ideate-tokens.test.mjs`, `tests/implementing-push-gate.test.mjs`, `tests/improve-fast-check.test.mjs`, `tests/improve-scope.test.mjs`, `tests/improve-speed.test.mjs`, `tests/lessons-globs.test.mjs`, `tests/memory-setting.test.mjs`, `tests/memory.test.mjs`, `tests/next-stage.test.mjs`, `tests/question-draft.test.mjs`, `tests/receipts.test.mjs`, `tests/remember-removed.test.mjs`, `tests/research-fetch-blocked.test.mjs`, `tests/research-fetch.test.mjs`, `tests/research-page-routes.test.mjs`, `tests/research-search.test.mjs`, `tests/research-verify.test.mjs`, `tests/session-stats.test.mjs`, `tests/settings-fail-soft.test.mjs`, `tests/skill-frontmatter.test.mjs`, `tests/skill-graph.test.mjs`, `tests/skill-overview.test.mjs`, `tests/slice-state.test.mjs`, `tests/smoke.sh`, `tests/start-board.test.mjs`, `tests/verify-print.test.mjs`, `verify/agent-shared-lines.txt`, `verify/checks/fix-class-load.mjs`, `verify/checks/name-clash.mjs`, `verify/checks/reference-chain.mjs`, `verify/checks/reference-shape.mjs`, `verify/checks/review-judges.mjs`, `verify/checks/skill-overview.mjs`, `verify/late-checks.mjs`, `verify/rule-removals.txt`, `verify/user-read.mjs` | Data: the prune tasks T1 to T12 of the consolidate run: deleted or trimmed files, directories as trailing-slash entries | Evidence: none (prune, no behavior change) | Proof: npm run validate:static

Commit:
```bash
git commit -m "docs(spec): record the consolidate plan tasks and the prune paths as landed"
```
