# Short reports and instruction-text review

## Goal
Every exo report to the user opens with at most three plain lines and points to its details file (#119), and verify gives a task that changes skill, agent, rule or hook text the light reviewer instead of `none (text only)` (#118).

## Decisions
- #118 instruction paths: a changed path counts as instruction text when one of its segments is `skills`, `agents`, `rules` or `hooks`, or its basename is `CLAUDE.md` or `AGENTS.md`; so `.claude/skills/x/SKILL.md` in a user project counts too. Alternative: only the four folders at the repository root; rejected, it misses user-project `.claude/` instruction files. Closed by: spec (user delegated every choice).
- #118 order in `taskReviewer` (`skills/verify/scripts/pick-reviewer.mjs:57`): the `Risk:` and inline-route lines stay first and unchanged; an instruction-text path then returns the light pick, before the `none (text only)` and output-only lines. `README.md`, `CHANGELOG.md`, `docs/` and any other non-script text outside those paths stay `none (text only)`. The comment at `skills/verify/scripts/verify.mjs:14` and the JSDoc above `taskReviewer` name the new rule. Closed by: spec.
- #119 shared place: the `low` text under `compression.rules` in `skills/configure/schema.json`, which the session hook injects into every session through the settings line. Alternatives: `hooks/session-rules.md`, rejected because `tests/cut-rules.test.mjs` holds it to the benchmark-proven restore rows and `INJECTED_CONTEXT_LOCK` to 100 bytes; a shared reference each skill points to, rejected because it repeats per skill and loads only inside a skill. Cost: compression `off` keeps full prose without this rule. Closed by: spec.
- #119 rule text, appended to the `low` rule as is: "Every report to the user opens with at most three short plain lines: what happened, whether it worked, and what the user must do now, or that nothing is needed. Hashes, counts, paths, deviations and review notes go to the run report (`.exo/run-report.md`, or its `.exo/kept/<run>/` copy after cleanup), else to the file the work already wrote, behind one pointer line, and are not repeated; with neither file they wait until asked. A choice for the user is one question with at most three one-line options, recommended first. No table or nested list unless the user asks for detail." Closed by: spec.
- #119 session load: `SESSION_LOAD_LOCK` in `verify/budgets.mjs` (499 of 500 words measured now) rises to the word count the session-load check measures after the rule lands, in the same commit, with that commit's date. Closed by: spec.
- #119 option cap: `skills/route-skills/references/question.md` rule 4 becomes "Two or three options", two only when no honest third route exists. The configure menus (`skills/configure/scripts/settings.mjs:162`, `MAX_PICKS`) print Keep plus at most two picks; a topic or value past the second pick is named in the context line as a typed answer, as values past the third are now. Alternative: exempt scripted menus from the cap; rejected, the user sees no difference between a scripted and a written question. Closed by: spec.
- #119 per-skill report lines: each line that sets a longer user message points to the session's report rule and keeps only what is specific to that skill. `skills/verify/SKILL.md:42` keeps the `REPORT` file contents and the one decision (`FAIL`, else `question`, else `ship`), and its three state lines become the rule's three lines with the `REPORT` path as the pointer. `skills/ship/SKILL.md` step 2: the overview is the rule's three lines, then the question; `Changed` and `Verified` lines go to the run report, left out when none exists. `skills/find-cause/SKILL.md:41` keeps its `Report:` line form (`tests/debug-phases.test.mjs:66` reads it); mechanism, proof lines and SHAs go to the debug log behind the pointer. `skills/refactor/SKILL.md:28`: evidence and line counts go behind the pointer. `skills/route-skills/SKILL.md:19` points to the rule. `CLAUDE.md` "Report that changed exo" line: `/reload-plugins` is the report's action line, not its last line. Closed by: spec.
- Budgets: `verify` and `find-cause` bodies sit under `STAGE_BODY_TOKENS` ceilings in `verify/budgets.mjs`; a task adding text there tightens other words in the same file and never raises a ceiling. Closed by: spec.
- `CHANGELOG.md`: the lead writes it; no task edits it. Closed by: user.

## Acceptance
- Task 1: `taskReviewer` returns the light pick for a task changing only `skills/x/SKILL.md`, and `none (text only)` for one changing only `README.md`; seam: `tests/pick-reviewer.test.mjs`.
- Task 2: `node skills/configure/scripts/settings.mjs context` at compression `low` prints the rule text; the session-load check passes.
- Task 3 and Task 4: question.md allows at most three options, and every configure menu prints at most three lettered options.
- Task 5: no skill body or `CLAUDE.md` line asks for a user message longer than the rule's three lines plus one pointer.
- The Success criterion passes on the branch rebased onto `origin/main`.

## Manual checks
- After `/reload-plugins`, a finished exo run's final message opens with at most three plain lines and one pointer to its run report.

## Plan basis
Repository: /Users/thomash/Documents/Code/personal/plugins/exo/.worktrees/short-reports-text-review
Branch: short-reports-text-review
Worktree setup: none
Land gate: npm run validate:static
Lint: none
Allow: none

## Success criterion
`npm run check` passes.

## Checkpoint
- Blocks first: none.
- Parallel: Tasks 1, 2, 3 and 5.
- Shared state: `tests/settings.test.mjs` (Tasks 2 and 4).
- Smallest safe split: one task per concern; Task 4 waits for Task 2 because both edit `tests/settings.test.mjs`.

## Tasks
### Task 1: fix(verify): review instruction-text tasks with the light reviewer
Depends on: none | Files: `skills/verify/scripts/pick-reviewer.mjs`, `skills/verify/scripts/verify.mjs`, `tests/pick-reviewer.test.mjs` | Data: a module-level list of instruction folder names and basenames, matched per path segment | Proof: node --test tests/pick-reviewer.test.mjs
### Task 2: feat(configure): add the short-report rule to the low compression rule
Depends on: none | Files: `skills/configure/schema.json`, `verify/budgets.mjs`, `docs/settings.md`, `tests/settings.test.mjs` | Data: the Decisions rule text appended to the existing `compression.rules.low` string | Proof: node --test tests/settings.test.mjs
### Task 3: fix(route-skills): cap a user question at three options
Depends on: none | Files: `skills/route-skills/references/question.md`, `tests/question-shape.test.mjs` | Data: rule 4 of the question shape, reworded to two or three options | Proof: node --test tests/question-shape.test.mjs
### Task 4: fix(configure): cap each settings menu at three options
Depends on: 2 | Files: `skills/configure/scripts/settings.mjs`, `tests/settings.test.mjs` | Data: `MAX_PICKS` lowered to 2 and applied to the topic menu too, the rest named as typed answers | Proof: node --test tests/settings.test.mjs
### Task 5: fix(skills): point per-skill report formats at the shared report rule
Depends on: none | Files: `skills/verify/SKILL.md`, `skills/ship/SKILL.md`, `skills/find-cause/SKILL.md`, `skills/refactor/SKILL.md`, `skills/route-skills/SKILL.md`, `CLAUDE.md`, `tests/agents.test.mjs` | Data: each skill's report line per the Decisions entry on per-skill report lines | Proof: node --test tests/agents.test.mjs tests/debug-phases.test.mjs
