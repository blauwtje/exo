# Consolidation schedule

Rule: tasks in one phase share no file and need no earlier result; at most 4 tasks per phase. Task 1 gates the rest, task 7 (the fold script) gates tasks 8 to 10, and the shared files `lib/model-kinds.json`, `tests/agents.test.mjs`, `CONTRIBUTING.md` and `verify/reference-owner-rows.txt` keep every other phase to one task.

## Phase 1
- Task 1 (hooks result file): `agents/orchestrator.md`, `hooks/dispatch-edit.mjs`, `lib/guard-rules.mjs`, `tests/hooks.test.mjs`, `tests/guard-rules.test.mjs`, `tests/agent-effort.test.mjs`

## Phase 2
- Task 2 (fold read-only agents): `agents/*` readers, `lib/model-kinds.json`, `verify/model-kinds.mjs`, `hooks/agent-effort.mjs`, `harnesses/codex/generate.mjs`, `lib/context-decisions.mjs`, `verify/budgets.mjs`, `tests/agents.test.mjs`, `tests/model-kinds.test.mjs`, `tests/agent-effort.test.mjs`

## Phase 3
- Task 3 (hook rules repoint): `hooks/dispatch-rules.md`, `hooks/session-rules.md`, `tests/hooks.test.mjs`, `tests/agent-effort.test.mjs`, `tests/session-start-codex.test.mjs`, `tests/session-start-source.test.mjs`
- Task 4 (skill references repoint): `skills/spec/references/*`, `skills/build/references/no-spec.md`, `skills/find-cause/investigator-prompt.md`, `tests/brief-*.test.mjs`, `tests/improve-round.test.mjs`, `tests/improve-setup.test.mjs`, `tests/spec-gate-text.test.mjs`

## Phase 4
- Task 5 (fold judges and fixers): `agents/review-branch.md`, `agents/build-task.md`, `lib/model-kinds.json`, `skills/gate/*`, `tests/agents.test.mjs`

## Phase 5
- Task 6 (spec modes): `skills/spec/*`, `skills/research/*`, `skills/ideate/*`, `skills/check-docs/*`, `verify/reference-owner-rows.txt`

## Phase 6
- Task 7 (fold map, check and fold script): `verify/fold-map.json`, `verify/fold-skills.mjs`, `verify/checks/folded-names.mjs`, `verify.mjs`, `tests/folded-names.test.mjs`, `skills/spec/*`, `skills/research/*`, `skills/ideate/*`, `skills/check-docs/*`, `.claude/CLAUDE.md`, `docs/principles/README.md`, `verify/reference-owner-rows.txt`

## Phase 7
- Task 8 (build modes): `skills/build/*`, `skills/run-plan/*`, `skills/refactor/*`, `skills/improve/*`, `skills/design-ui/*`, `lib/model-kinds.json`, `verify/reference-owner-rows.txt`

## Phase 8
- Task 9 (gate and ship modes): `skills/gate/*`, `skills/review/*`, `skills/ship/*`, `skills/file-issues/*`, `verify/reference-owner-rows.txt`

## Phase 9
- Task 10 (edit-skills and start modes): `skills/edit-skills/*`, `skills/prompt/*`, `skills/remember/*`, `skills/start/*`, `skills/configure/*`, `skills/save-session/*`, `skills/route-skills/*`, `hooks/session-end.mjs`, `hooks/session-routing.md`, `verify/reference-owner-rows.txt`

## Phase 10
- Task 11 (launcher frontmatter): `skills/{build,gate,find-cause,ship,write-docs,edit-skills,watch}/SKILL.md`, `skills/build/references/tail.md`, `skills/build/references/run-loop.md`, `agents/orchestrator.md`, `tests/skill-text.test.mjs`, `verify/checks/reference-tables.mjs`

## Phase 11
- Task 12 (spec dispatch and orchestrator budgets): `skills/spec/SKILL.md`, `agents/orchestrator.md`, `hooks/dispatch-rules.md`, `verify/budgets.mjs`, `lib/model-kinds.json`, `tests/spec-verdict.test.mjs`

## Phase 12
- Task 13 (docs): `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `docs/skills/spec.md`, `docs/skills/build.md`, `docs/skills/start.md`, `docs/skills/gate.md`, `docs/skills/ship.md`, `docs/skills/edit-skills.md`
