# exo small items

## Goal
Eleven small defects found in the density runs are fixed on one branch: build lands and briefs tasks reliably, three references gain or lose a reader, the configure overview leads with labels, the docs agree with the skills, and verify catches duplicated sections and stops failing on a mid-run release.

## Decisions
- Item 1 (land-task refuses `Proof: <command>: pass` on one line): the smallest fix; `outcomeLine` in `proofOf` (`skills/build/scripts/land-task.mjs:176`) accepts an optional `Proof:` field prefix before the command; output collection after it stays unchanged; `Proof: the tests look fine` still refuses. Closed by: user.
- Item 4 (implementers abbreviate the Proof path): wording only in `agents/build-task.md`; the report copies the brief's `Proof:` command character for character, never shortening a path to `...`, and the Report section shows the four-line layout `Proof:` / `<command>: pass` / indented output / `Unresolved: none`. land-task keeps its literal match, no fuzzy path matching. Closed by: user.
- Item 2 (next-task briefs drop the plan's Decisions): `frameOf` (`lib/plan-tasks.mjs:221`) reads `## Decisions` into `decisions`; `taskBrief` and `frameReport` (`skills/build/scripts/next-task.mjs`) print `Decisions for these paths:` after the Context lines, through `bulletsFor`. Closed by: user.
- Item 3 (save-session reference unreachable): keep `references/reconstructing-without-a-note.md`; retrigger its row in `skills/save-session/SKILL.md` to: save-session itself starts without a note and must rebuild context before saving. Closed by: user.
- Item 5 (ship self-test pins): no repo change; dropped. Closed by: user.
- Item 6 (`skills/route-skills/references/next-stage.md` has no runtime reader): delete it and its pins in `tests/question-shape.test.mjs` (the NEXT_STAGE read at :17 and the test at :72-80); move its live rule 3 (an `exo: context` notice keeps the letters and hands the work on through a fresh delegate) and rule 5 (a skill another stage or a workflow invoked shows no question and returns control to that caller) into `skills/spec/SKILL.md` step 8 and `skills/find-cause/SKILL.md` step 7; point `skills/edit-skills/references/pressure-scenarios.md:33` at the kinds in `lib/model-kinds.json`; fix `docs/skills/route-skills.md:18` and the comments in `skills/route-skills/scripts/next-stage.mjs` that name the md. Closed by: user.
- Body budgets: spec (759 of 760), find-cause (750 of 750) and `agents/build-task.md` (750 of 750) sit at their ceilings in `verify/budgets.mjs`; a task adding text there tightens other words in the same file to stay within the ceiling and never raises it. Closed by: spec.
- Item 7 (edit-skills step 2 hardcodes `sonnet:high`): `skills/edit-skills/SKILL.md:19` takes `--cells <model:effort>`, the cell `references/pressure-scenarios.md` picks for the skill's kind. Closed by: user.
- Item 8 (settings tests skip the question shape): one test in `tests/settings.test.mjs` renders `menu`, each TOPICS key and each SCHEMA key, takes stdout after the closing fence and calls `assertQuestionShape`. Closed by: user.
- Item 9 (configure overview shows raw keys): label first, raw key and raw value in brackets. `settingBlock` (`skills/configure/scripts/settings.mjs:97`) heads each block `<n>. <label>: <plain value>  (<key> = <raw value>, <origin>)`; the schema `about` replaces `description`; the options line lists choice labels with the current one in `[ ]`; the `overrides:` line keeps raw `layer=value`; the 76-column cap holds. Closed by: user (format: spec).
- Item 10 (start cheat sheet drift): `README.md:110` takes the cheat sheet's verify phrases ("verify the plan at docs/...", "verify the branch for the plan at docs/..."); the cheat sheet's remember row takes README's "or approves a claim two sessions have booked"; `docs/skills/start.md:13` says `spec` writes the brief "then offers to `build` it". Closed by: user.
- Item 11 (no duplicate-section check): `checkProcessStructure` (`verify/checks/process-structure.mjs`) FAILs a SKILL.md body that repeats a `## ` or `### ` heading text, or a non-blank line over 40 characters outside tables and fences; `verify/self-test.mjs` gains a scenario duplicating a `## References` block. Closed by: user.
- Item 12 (plugin version fails after a mid-run release): keep the `origin/main` tip comparison; when the version is below it and the plugin.json version at `git merge-base HEAD origin/main` equals the branch's version, report WARN naming "rebase onto origin/main" instead of FAIL; a branch that lowered its own version still FAILs. Closed by: user.

## Acceptance
- Task 1: a build report with `Proof: <command>: pass` on one line lands.
- Task 4: a task brief from next-task carries the plan's Decisions.
- The Success criterion passes on the branch rebased onto `origin/main`.

## Plan basis
Repository: /Users/thomash/Documents/Code/personal/plugins/exo/.worktrees/small-items
Branch: small-items
Worktree setup: none
Land gate: none
Lint: none

## Success criterion
`npm run check` passes.

## Checkpoint
- Blocks first: Tasks 1 and 2.
- Parallel: Tasks 3, 4, 5, 7, 8, 9, 11 and 12.
- Shared state: `tests/settings.test.mjs` (Tasks 9, 10); the next-stage rules move from `skills/route-skills/references/next-stage.md` before it is deleted (Tasks 5, 6).
- Smallest safe split: one task per item, item 6 split into moving its rules and deleting the file; shared files serialized by Depends on.

## Tasks
### Task 1: fix(build): land a one-line Proof: command pass line
Depends on: none | Files: `skills/build/scripts/land-task.mjs`, `tests/land-task.test.mjs` | Data: the `outcomeLine` RegExp in `proofOf`, with an optional `Proof:` prefix before the command | Proof: node --test tests/land-task.test.mjs
### Task 2: fix(agents): copy the Proof command verbatim in the build report
Depends on: none | Files: `agents/build-task.md` | Data: the Report section's Proof rule plus a four-line report layout, within the 750-token agent ceiling | Proof: npm run validate
### Task 3: fix(verify): warn instead of fail when only a release moved origin/main ahead
Depends on: 1, 2 | Files: `verify/checks/plugin-version.mjs`, `tests/plugin-version.test.mjs` | Data: the plugin.json version at `git merge-base HEAD origin/main`, compared with the branch's version | Proof: node --test tests/plugin-version.test.mjs
### Task 4: fix(build): carry the plan's Decisions into each task brief
Depends on: 1, 2 | Files: `lib/plan-tasks.mjs`, `skills/build/scripts/next-task.mjs`, `tests/next-task.test.mjs` | Data: a `decisions` bullet array on the object `frameOf` returns | Proof: node --test tests/next-task.test.mjs
### Task 5: refactor(spec): state the context-notice and borrowed-stage rules in spec and find-cause
Depends on: 1, 2 | Files: `skills/spec/SKILL.md`, `skills/find-cause/SKILL.md` | Data: two rules on spec step 8 and on find-cause step 7, each body within its STAGE_BODY_TOKENS ceiling | Proof: npm run validate
### Task 6: refactor(route-skills): delete the unread next-stage reference
Depends on: 5 | Files: `skills/route-skills/references/next-stage.md`, `tests/question-shape.test.mjs`, `skills/route-skills/scripts/next-stage.mjs`, `skills/edit-skills/references/pressure-scenarios.md`, `docs/skills/route-skills.md` | Data: no new structure; the model and effort source becomes the kinds in `lib/model-kinds.json` | Proof: node --test tests/question-shape.test.mjs tests/next-stage.test.mjs
### Task 7: fix(edit-skills): take the pressure cell from the skill's kind
Depends on: 1, 2 | Files: `skills/edit-skills/SKILL.md` | Data: the step 2 `--cells <model:effort>` argument | Proof: npm run validate
### Task 8: fix(save-session): retrigger the no-note reference for its own reader
Depends on: 1, 2 | Files: `skills/save-session/SKILL.md` | Data: the Read-it-when cell of the `references/reconstructing-without-a-note.md` row | Proof: npm run validate
### Task 9: test(configure): check every settings menu question's shape
Depends on: 1, 2 | Files: `tests/settings.test.mjs`, `skills/configure/scripts/settings.mjs` | Data: one loop over `menu`, the TOPICS keys and the SCHEMA keys | Proof: node --test tests/settings.test.mjs
### Task 10: feat(configure): lead the settings overview with labels
Depends on: 9 | Files: `skills/configure/scripts/settings.mjs`, `tests/settings.test.mjs` | Data: the lines `settingBlock` returns per key | Proof: node --test tests/settings.test.mjs
### Task 11: docs(start): align the README, cheat sheet and start doc
Depends on: 1, 2 | Files: `README.md`, `skills/start/references/cheat-sheet.md`, `docs/skills/start.md` | Data: the verify and remember table rows and one start doc bullet | Proof: npm run validate
### Task 12: feat(verify): fail a SKILL.md that repeats a section
Depends on: 1, 2 | Files: `verify/checks/process-structure.mjs`, `verify/self-test.mjs` | Data: one `Set` of seen heading texts and long lines per SKILL.md body | Proof: npm run validate:self
