# Prune exo files by usage

Date: 2026-11-07. Counter: benchmarks/usage-count.mjs, run with `--all-projects` over every session transcript.

## Summary

- Sessions counted: 50898.
- Files at zero use: 47.
- Files removed: 0. Every one of the 47 is an entry point, is referenced by another file or a check, or sits on a failure or recovery path.
- Spent: $0.
- Scoped to this repository's last 30 sessions, 129 files showed zero use with no referrer, which is why the all-projects count was used.

## Kept at zero, with reason

| path | reason |
|---|---|
| hooks/handoff-stub.md | failure/recovery path |
| lib/context-series.mjs | referenced by package.json |
| lib/review-judges.mjs | referenced by benchmarks/review-judges/generate.mjs tests/benchmark-review-judges.test.mjs verify/checks/review-judges.mjs |
| lib/shipped-briefs.mjs | referenced by package.json tests/shipped-behaviour.test.mjs |
| lib/skill-overview.mjs | referenced by skills/start/scripts/overview.mjs tests/skill-overview.test.mjs verify.mjs |
| skills/build/references/conflict-wave.md | failure/recovery path |
| skills/build/scripts/checkpoint.mjs | failure/recovery path |
| skills/design-ui/references/color.md | referenced by skills/design-ui/SKILL.md verify/reference-owner-rows.txt |
| skills/design-ui/references/layout.md | referenced by skills/design-ui/SKILL.md verify/reference-owner-rows.txt |
| skills/design-ui/references/reference-input.md | referenced by skills/design-ui/SKILL.md verify/reference-owner-rows.txt |
| skills/design-ui/scripts/regions.mjs | referenced by CHANGELOG.md benchmarks/value/test-pollution/hidden/check-data/tests-original/tax.test.mjs benchmarks/value/test-pollution/seed/src/pricing/tax.mjs |
| skills/edit-skills/references/plugging-holes.md | referenced by docs/principles/prompt.md skills/edit-skills/SKILL.md verify/reference-owner-rows.txt |
| skills/file-issues/scripts/find-duplicates.mjs | referenced by CHANGELOG.md skills/file-issues/SKILL.md tests/file-issues-duplicates.test.mjs |
| skills/find-cause/references/finish.md | referenced by benchmarks/speed-ledger.jsonl benchmarks/speed-ledger.md skills/find-cause/SKILL.md |
| skills/gate/assets/run-report.md | referenced by CHANGELOG-archive.md docs/specs/short-reports-text-review.md output-styles/adhd.md |
| skills/gate/references/review-dispatch.md | referenced by skills/gate/SKILL.md verify/reference-owner-rows.txt |
| skills/review/scripts/resolve-target.mjs | referenced by docs/skills/review.md skills/review/SKILL.md tests/review-resolve-target.test.mjs |
| skills/review/SKILL.md | entry point |
| skills/route-skills/assets/handover-template.md | referenced by agents/orchestrator.md lib/slice-state.mjs skills/route-skills/references/user-read-format.md |
| skills/route-skills/references/user-read-format.md | referenced by CHANGELOG.md skills/gate/assets/run-report.md skills/route-skills/assets/handover-template.md |
| skills/run-plan/assets/exo-run.yml | referenced by docs/skills/run-plan.md skills/run-plan/scripts/ci-render.mjs tests/run-plan-ci.test.mjs |
| skills/run-plan/scripts/ci-bundle.mjs | referenced by skills/run-plan/scripts/ci-publish.mjs skills/run-plan/scripts/ci-run.mjs tests/run-plan-ci.test.mjs |
| skills/run-plan/scripts/ci-plan-path.mjs | referenced by skills/run-plan/assets/exo-run.yml skills/run-plan/scripts/ci-run.mjs tests/run-plan-ci.test.mjs |
| skills/run-plan/scripts/ci-publish.mjs | referenced by skills/run-plan/assets/exo-run.yml |
| skills/run-plan/scripts/ci-render.mjs | referenced by skills/run-plan/SKILL.md tests/run-plan-ci.test.mjs |
| skills/run-plan/scripts/ci-run.mjs | referenced by skills/run-plan/assets/exo-run.yml |
| skills/save-session/references/reconstructing-without-a-note.md | referenced by docs/specs/small-items.md skills/save-session/SKILL.md verify/reference-owner-rows.txt |
| skills/ship/references/ask-menu.md | referenced by skills/ship/SKILL.md verify/reference-owner-rows.txt |
| skills/ship/references/commit-split.md | referenced by skills/ship/SKILL.md verify/reference-owner-rows.txt |
| skills/ship/references/overview-extras.md | referenced by skills/ship/SKILL.md verify/reference-owner-rows.txt |
| skills/ship/references/pr-comments.md | referenced by CHANGELOG-archive.md skills/ship/SKILL.md verify/reference-owner-rows.txt |
| skills/ship/references/stack.md | referenced by skills/ship/SKILL.md verify/reference-owner-rows.txt |
| skills/ship/references/watch.md | referenced by CHANGELOG-archive.md skills/ship/SKILL.md verify/reference-owner-rows.txt |
| skills/ship/scripts/commit-split.mjs | referenced by CHANGELOG.md docs/skills/ship.md skills/ship/references/commit-split.md |
| skills/ship/scripts/pr-body.mjs | referenced by CHANGELOG.md docs/skills/ship.md skills/ship/references/pr-prep.md |
| skills/ship/scripts/pr-comment-tasks.mjs | referenced by CHANGELOG.md skills/ship/references/pr-comments.md tests/shipping-pr-comment-tasks.test.mjs |
| skills/spec/references/ask-rules.md | referenced by skills/spec/SKILL.md verify/reference-owner-rows.txt |
| skills/spec/references/map-locate.md | referenced by skills/spec/SKILL.md tests/spec-gate-text.test.mjs verify/reference-owner-rows.txt |
| skills/spec/scripts/behaviour.mjs | referenced by CHANGELOG.md docs/behaviour/agents.md docs/behaviour/benchmarks.md |
| skills/spec/scripts/plan-template.mjs | referenced by CHANGELOG.md skills/spec/references/templates.md tests/plan-template.test.mjs |
| skills/start/references/run.md | referenced by CHANGELOG.md benchmarks/replay/cases/6/case.json benchmarks/replay/cases/6/prompt.md |
| skills/start/scripts/board.mjs | referenced by benchmarks/value/export-mismatch/check.mjs benchmarks/value/export-mismatch/seed/bin/dashboard.mjs benchmarks/value/export-mismatch/seed/package.json |
| skills/start/scripts/overview.mjs | referenced by lib/skill-overview.mjs skills/start/references/cheat-sheet.md tests/skill-overview.test.mjs |
| skills/watch/scripts/list-options.mjs | referenced by skills/watch/scripts/list.mjs |
| skills/watch/scripts/list.mjs | referenced by CHANGELOG.md benchmarks/bisect/list-defaults/build.mjs benchmarks/bisect/list-defaults/case.json |
| skills/write-docs/references/release-notes.md | referenced by .github/workflows/release.yml docs/skills/write-docs.md skills/write-docs/SKILL.md |
| skills/write-docs/scripts/release-notes-draft.mjs | referenced by CHANGELOG.md docs/skills/write-docs.md skills/write-docs/references/release-notes.md |
