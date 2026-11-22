# Repo-survey improvements for exo

Source: the 30-item list in the handoff of branch `claude/gallant-heisenberg-32091o` and its research notes.

## Goal
Build the improvements that the survey of 50+ repositories found for exo's skills, agents, scripts and checks. exo gets cheaper and easier to use, with no new hook, no statusline change and no script that gains an option. Lessons from repeated corrections and from repeated failed tool calls are shared between projects.

## Verdict
Verdict: go
Objection: Most items come from other repos, not from a failure seen in a real session.

## Decisions
1. No hook is added and the statusline is untouched; a hook-like idea becomes script output or skill text.
2. No existing script gains an option: new behaviour is the default output, a value comes from the repo, and a job with its own input is its own script.
3. Lessons are shared between projects as in microsoft/TokenEconomizer: one store on the user's machine, facts from corrections and from failed tool calls that repeat across sessions, read from the session logs with no model, offered after 3 sessions, dropped when later runs contradict them, counted by the existing session-start line, and global when seen in 2 or more projects. The script counts and the model judges.
4. Every task line names its builder as `Model: <model> <effort>`: a text edit with given wording runs on Haiku at low effort, a script with tests on Sonnet, the shared-lessons design on Opus at high effort. The lead passes both words to the Agent tool.
5. Task 1 records the requests in `evals/failures.md` before any skill, agent, hook script or check changes, one line per part, and every other task depends on it. (exo decided)
6. Task 2 lands the option-count check before any script changes, so the Land gate stops a new option. (exo decided)
7. `decide()` stays in `benchmarks/layout-ab.mjs`: its three-arm rule shares no code with the two-arm verdict of `evals/value.mjs`. (exo decided)
8. The `with` and `without` cells of `evals/value.md` stay plain counts; `k/n` goes to the printed line and the verdict to a new last column. (exo decided)
9. plan-check does not validate `Model:`: a wrong word fails at dispatch, and a second list of models would be a second source of truth. (exo decided)
10. The review effort ladder starts at 150 changed lines and steps at 4 times and 16 times that; `EXO_REVIEW_LINES` overrides the base and the ladder never picks `max`. (exo decided)
11. The undo commands live in a new script `undo-task.mjs` that takes the task number as its argument, because `next-task.mjs` cannot know which task to undo without an option. (exo decided)
12. Failed tool calls are stored beside the ledger in their own file, as word hashes only; the text is read again from the transcript when shown. (exo decided)
13. A global cluster needs at least one session in the current project, and a verdict in any project hides it in all. (exo decided)
14. Stale notes print as `stale:` lines and never change the exit code of `lessons.mjs check`. (exo decided)
15. The count of corrections after a skill ran is a script under `evals/` for exo's own development, not a step of the learn skill. (exo decided)
16. The `--uncovered` step leaves the document skill: the script rejects that option and no option is added. (exo decided)
17. One late task edits `CONTRIBUTING.md` for all parts, so the parts stay parallel. (exo decided)
18. `skills/author/SKILL.md` names no exo path, because it ships to other projects; `CONTRIBUTING.md` names `evals/trigger.mjs`. (exo decided)
19. The cap of 5 options for a new script is a constant in the check, with no override, because an override would switch the check off. (exo decided)
20. Every new `catch` binds its error as `catch (error)` and reports or rethrows it, because `verify/checks/silent-catch.mjs` fails a new catch with no binding under the Land gate. (exo decided)
21. Failed tool calls are learned by `backfill` and by the detached `recount` that session-start starts, which reads only the transcripts changed since the failures file was written; no hook is added for them. (exo decided)

## Non-goals
- `background: true` on the agents: `agents/builder.md`, `agents/researcher.md`. The docs say a subagent already starts in the background.
- Counting reply shape by script, a judge with no verdict counted as cut, a cached without-exo arm and a judge calibration set: `evals/shape.mjs`, `evals/value.mjs`. Each needs one real eval result file and its `trace.jsonl`, which the repo does not hold.
- A new hook or a statusline element: `hooks/hooks.json`, `lib/statusline.mjs`.
- Code rules loaded as a skill, and pruning unused tools: `skills/build/references/code-rules.md`.
- Moving `decide()` to `lib/`: `benchmarks/layout-ab.mjs`.
- A release or a version bump: `package.json`.

## Assumptions
- [code] `fieldSegments` keeps an unknown `Model:` segment and plan-check ignores it -> every task line of this plan carries one today (lib/plan-tasks.mjs)
- [code] A Proof runs through `bash -e -c` -> `&&`, quotes and `test` work in a Proof (lib/process-tree.mjs:58)
- [code] `landingForCaller` drops lines that start with two spaces -> the removed-lines block of Task 13 starts at column 0 (skills/build/scripts/land-task.mjs)
- [code] `evalCaseNames` counts every folder under `evals/` except `results` as a case -> the trigger prompts are one file, not a folder (evals/value.mjs)
- [code] `regressions` reads the `with` and `without` cells with `isCount` -> those cells stay plain counts (evals/value.mjs)
- [code] Word hashes carry no project salt -> the ledgers of two projects compare directly (skills/learn/scripts/corrections.mjs)
- [code] `environmentMs` parses any positive integer -> it also reads `EXO_REVIEW_LINES` and `EXO_LEARN_STALE_DAYS` (lib/script-flags.mjs:45)
- [code] Two tests rewrite the Task 3 line of the example plan -> Task 9 adds its sample to the Task 5 line only (tests/finding-consumes-list.test.mjs)
- [code] `claude --help` of 2.1.330 lists `--max-budget-usd`, `--plugin-dir` and `--output-format` and no `--max-turns` -> Task 6 ends the child process itself at the first tool call (evals/trigger.mjs)
- [code] `claude plugin eval --help` lists `--runs <n>` with the default `case.runs ?? 3` -> Task 4 passes `--runs 2` (claude 2.1.330)
- [code] `recount` only drops and counts, and prompts reach the ledger through the hook and the one-time `backfill` -> Task 28 makes `backfill` and `recount` scan for failed tool calls (skills/learn/scripts/corrections.mjs:394)
- [code] `words()` drops every token that holds `/` -> Task 28 turns `/`, `.` and `-` into spaces first (skills/learn/scripts/corrections.mjs:47)
- [code] `countedWords` keeps a word only at 2 or more uses and at most 5% of the rows -> Task 28 counts over prompt rows and failure rows together (skills/learn/scripts/corrections.mjs:284)
- [code] `listed()` drops a cluster whose middle row has no transcript text -> Task 28 makes `transcriptTexts` map failure ids too (skills/learn/scripts/corrections.mjs:348)
- [code] `handoff.mjs` and `verify.mjs` write `parseArgs({` and `options: {` on separate lines -> Task 2 matches across newlines (skills/save/scripts/handoff.mjs:22)
- [code] `parseFlags` throws on an argument that does not start with `--` -> Task 12 splits off the task number first (lib/script-flags.mjs:21)
- [code] `textHits` gives its callback only the line and returns `path:line hit` strings -> Task 3 filters the returned strings by path (verify/text-hits.mjs:11)
- [code] `isTestPath` accepts every file under a `tests/` folder -> Task 21 also asks for a test file name (lib/red-green.mjs:12)
- [code] `landTask` is an export of `land-task.mjs`, and the fixture plan names no test file -> Task 13 builds its own plan (skills/build/scripts/land-task.mjs:31)
- [code] `repo-map.mjs` prints the map path and a grep line, and the map file starts `# Repository map` -> Task 17 puts the legend on line 2 of the map file (skills/spec/scripts/repo-map.mjs:31)
- [code] `bisect.mjs` exits 1 when its report starts with `Bisect:` -> Task 21 prints `Bisect: the test fails alone` (skills/diagnose/scripts/bisect.mjs:62)
- [code] A ledger file is named `<letters, digits, dashes>.jsonl`, beside `.verdicts.jsonl` -> Task 30 finds project ledgers by that name (skills/learn/scripts/corrections.mjs:65)
- [code] `defaultBase` is null on the default branch -> the tests of Task 11 run on a feature branch (lib/plan-landed.mjs:5)
- [assume] A verdict row for a failure carries the added field `failed: true`, and prompt matching skips such rows -> an old verdict row has no such field and reads as a prompt verdict, as today.
- [assume] `clusters` drops rows that have a verdict -> Task 27 passes an empty verdict list, so a kept or rejected correction still counts.
- [assume] A backticked relative path in a note is a span with no space that holds `/` or ends in a file extension and does not start with `/`, `~` or `$` -> Task 25 uses that rule.
- [assume] A later clean run is a tool call that did not fail and is `similar` to any failure row of the cluster -> Task 29 uses that rule.
- [assume] `mergeRuns` pairs cases by case name, not by position -> Task 4 uses that rule.
- [assume] A `'--word'` literal counts as an option with `===`, `case`, `.includes(` and `.indexOf(`, not with `.startsWith(` -> Task 2 uses that rule.
- [assume] A stream-json line of `claude -p` carries a tool call as `{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Skill","input":{"skill":"exo:<name>"}}]}}` -> Task 6 parses that shape, its tests fake it, and the first Manual check proves it on a real run.
- [assume] `npm run check` is green on `main` on the user's machine. In the cloud container that wrote this plan, 5 tests fail before any change: four named `<case> scaffold exits 0 in an empty directory` and one named `an unreadable config ledger is treated as absent and candidates lists from the scratch folder` -> a build in such a container compares with that baseline and repairs none of the five.
- [assume] The numbers in Task 32 come from the research notes on the xyrlan/mnemo README and were not fetched again -> the sentence names its source.
- [assume] Task 1 counts transcripts on the machine that builds; a cloud container holds only its own session files -> the counts there are small and still true.
- [assume] `Branch:` is a topic name -> a cloud session that builds this plan uses the branch its session names instead.
- [assume] Failure rows hold word hashes of the tool name and its main input, never the error text -> the privacy lines of 2026-11-16 in `evals/failures.md` stay true.

## Acceptance
- Task 2 makes `npm run validate:static` fail when a script declares one more option than at the merge-base with `origin/main`.
- Task 4 runs a case twice and a third time only when the two runs split.
- Task 5 writes `better`, `same`, `worse` or `not sure yet` in the `verdict` column.
- Task 6 prints `wrong: <n> of <m>` for the near-miss prompts of one skill.
- Task 8 keeps the task text out of the lead's context: stdout holds three lines.
- Task 11 prints the review effort with `Next: none`.
- Task 12 prints revert commands and runs none.
- Task 13 shows each removed test line in the landing report.
- Task 15 gives the end review the plan's Review Focus bullets.
- Task 18 prints the handoff facts and what changed since the handoff.
- Task 21 prints `Polluter: <file>`.
- Task 22 leaves no `--uncovered` in the document skill.
- Task 24 prints the kept lesson's name in the hook line.
- Task 25 prints a `stale:` line for a stale note.
- Task 28 lists a tool call that failed in 3 sessions as a candidate.
- Task 30 marks a cluster seen in 2 projects as `global (2 projects)`.
- No script gains an option and no hook is added: Task 2 proves the options and the Success criterion proves the hook set.
- The Success criterion passes.

## Manual checks
- Before the next release, run `node evals/trigger.mjs save`. You should see one line per prompt and a last line `wrong: <n> of 8`, for less than 5 USD.
- In that release, run `node evals/value.mjs --run adhd`. You should see `adhd: with <k>/<n> runs, without <k>/<n> runs, <verdict>, cut <cut>` and a filled `verdict` cell in `evals/value.md`.
- Keep one `--json` result file and its `trace.jsonl` from that run. They unlock the four eval items under Non-goals.
- Correct the same thing in 3 sessions spread over 2 projects, then run `/exo:learn`. You should see that candidate with `global (2 projects)`.
- Let one command fail the same way in 3 sessions, then run `/exo:learn`. You should see a candidate that starts with `failed:`.
- Save a handoff, commit once and ask to continue. You should see that commit named as changed since the handoff.
- After the build, start a new session to use the changed exo. `/reload-plugins` updates only the open session.

## Plan basis
Repository: /home/user/exo
Branch: repo-survey-improvements
Worktree setup: none
Land gate: npm run validate:static

## Success criterion
`npm run check` passes.
Red: none (it passes on `main`; each task's Proof proves its own red)
Product run: none (`package.json` names no `bin` and no `scripts.start`)

## Log
- 2026-11-22 Plan written from the 30-item survey list; items 6, 9, 13, 14 and 15 are left out, with the reason under Non-goals.

## Tasks
### Task 1: docs(evals): record the repo-survey requests in failures.md
Depends on: none | Files: `evals/failures.md` | Data: none (eleven dated lines, read by people) | Model: sonnet low | Proof: test "$(grep -c '^- 2026-11-22 ' evals/failures.md)" -ge 11

Append eleven lines at the end of the file, one per part, each shaped as `- 2026-11-22 <part>: <gap>; <k> of <n> session files hold "<phrase>" (user request).`
Count `<n>` with `find "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects" -name '*.jsonl' | wc -l` and `<k>` with `grep -rlF --include='*.jsonl' -e '<phrase>' "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects" | wc -l`.
The parts, each with its gap and its phrase:
- `build skill`: the task brief is printed into the lead's context, the second attempt always runs on Opus, the review effort is fixed at medium, a drifted plan leaves no undo commands and a weakened test shows only in the end review. Phrase `next-task.mjs`.
- `spec skill`: a task cannot name its model, a plan cannot tell the end review where to look and the repo map does not show which exports many files use. Phrase `repo-map.mjs`.
- `learn skill`: failed tool calls are not mined, a lesson stays inside one project, stale notes are found by reading every note and the hook line shows an id with no name. Phrase `corrections.mjs`.
- `save skill`: the git facts of a handoff and its staleness check are done by hand and a ruled-out approach hides inside Evidence. Phrase `handoff.mjs`.
- `diagnose skill`: Isolate does not compare with a working case and a test that fails only after another test has no finder. Phrase `bisect.mjs`.
- `document skill`: the release-notes steps name `--uncovered`, which `release-notes-draft.mjs` rejects with `ERR_PARSE_ARGS_UNKNOWN_OPTION` and exit 1 in 1 of 1 run on 2026-11-22, and a how-it-works answer has no fixed shape. Phrase `--uncovered`.
- `author skill`: a description edit is accepted on the same prompts it was tuned on and a dropped edit leaves no record. Phrase `should_trigger`.
- `evals`: every case runs three times even when two runs agree, the table shows counts with no verdict and nothing measures a prompt that must not trigger a skill. Phrase `value.mjs`.
- `checks`: no check stops a script from gaining options or a `$1` literal from entering skill text. Phrase `parseFlags`.
- `builder agent`: the builder has no rule for a context that fills up. Phrase `exo:builder`.
- `hooks`: no line says why the two hooks only detect. Phrase `UserPromptSubmit`.

### Task 2: feat(check): fail when a script gains an option
Depends on: 1 | Files: `verify/checks/script-options.mjs`, `verify.mjs`, `tests/script-options.test.mjs` | Data: `checkScriptOptions(report, repository)` with the check label `script options`, and `optionNames(source)` that returns the sorted unique option names one script declares; read by `verify.mjs` | Model: sonnet medium | Proof: node --import ./tests/clean-run-env.mjs --test tests/script-options.test.mjs

- `optionNames` counts only declared options: the keys of a `parseFlags(` spec, of a `FLAGS = {` constant and of a `parseArgs({` call whose `options: {` follows after any whitespace, newlines included, plus a quoted `'--word'` literal that the script compares (`===`, `case`, `.includes(`, `.indexOf(`). A `'--word'` literal inside an argument list for another program does not count, and `help` does not count.
- The check reads every tracked `.mjs` file outside `tests/`.
- It compares each file with the same file at the merge-base of `HEAD` and `origin/main`, found the way `verify/checks/plugin-version.mjs` finds it. FAIL names the file and the new option when a file declares more options than there. A file that is new since the merge-base FAILs above 5 options. UNRUN when `origin/main` is missing.
- It runs under `node verify.mjs --static`, so the Land gate sees it.
- Tests use a temp git repo with a fake `origin/main`, as `tests/check-red-b.test.mjs` does: an old script with one more option FAILs, an unchanged script passes, a new script with 6 options FAILs and with 5 passes, a `parseArgs` call split over lines counts its options, a spawn argument list adds nothing, a missing `origin/main` is UNRUN.

### Task 3: feat(check): flag positional $N literals in skill text
Depends on: 2 | Files: `verify/checks/positional-literals.mjs`, `verify.mjs`, `tests/positional-literals.test.mjs` | Data: `checkPositionalLiterals(report, repository)` with the check label `positional literals`; read by `verify.mjs` | Model: sonnet low | Proof: node --import ./tests/clean-run-env.mjs --test tests/positional-literals.test.mjs

- Claude Code replaces `$1`-style text in a skill body with an argument, so a literal such as a price is eaten.
- Build it like `verify/checks/personal-paths.mjs`, on `textHits` of `verify/text-hits.mjs`: pattern `\$[0-9]`. Keep only the returned hits whose path matches `^(skills|agents|output-styles)/.*\.md$`, and leave `verify/text-hits.mjs` unchanged. FAIL lists each hit as `path:line`.
- The tree has 0 hits today, so the check passes after it lands.
- Tests follow `tests/personal-paths.test.mjs`: a skill file with `$1` FAILs, a file outside the three folders passes.

### Task 4: feat(evals): stop a case at two agreeing runs
Depends on: 2 | Files: `evals/value.mjs`, `tests/value.test.mjs` | Data: `needsThird(testCase)` returns a boolean and `mergeRuns(first, extra)` returns the cases of `first` with the runs of `extra` added; both read by `evalCase` in the same file | Model: sonnet medium | Proof: node --import ./tests/clean-run-env.mjs --test tests/value.test.mjs

- `evalCase` adds `--runs 2` to its `claude plugin eval` call.
- `needsThird(testCase)` is true when, in either arm, the two runs disagree on `passed` and neither is cut.
- When it is true, `evalCase` calls the CLI once more for that case with `--runs 1` and with the budget that is left (`maxCost` minus the cost of the first call, by `runCost`). With nothing left it makes no third call.
- `mergeRuns` pairs the cases by case name and adds the extra runs to each arm under new keys with the prefix `third-`, so `armFigures` sees three runs and its majority rule decides.
- Tests: two agreeing runs need no third, a split needs one, a cut run needs none, and a merged case holds 3 runs per arm.

### Task 5: feat(evals): add a verdict column and k/n run counts
Depends on: 4 | Files: `evals/value.mjs`, `evals/value.md`, `tests/value.test.mjs` | Data: `verdictOf(withExo, without)` returns `better`, `same`, `worse` or `not sure yet`; `runTally(cases, arm)` returns `{ passed, total }`; the last column `verdict` of `evals/value.md`, read by people | Model: sonnet medium | Proof: node --import ./tests/clean-run-env.mjs --test tests/value.test.mjs

- `verdictOf` takes two results of `armFigures`. It returns `not sure yet` when either arm has `cut` above 0 or a cost of `-`, or when both arms passed 0 cases. A row that `settle` marks `fail` or `void` gets `not sure yet`. Else `better` when with-exo passed more cases, `worse` when fewer, `same` when equal.
- `runTally(cases, arm)`: `passed` counts the runs that passed and are not cut, `total` counts all runs.
- `settle` adds `verdict` to the row. `COLUMNS` gets `verdict` as its last entry. `FIGURES` stays as it is, so an old row is not measured again. `armFigures` keeps its return shape.
- The line that `runNext` prints becomes `<part>: with <k>/<n> runs, without <k>/<n> runs, <verdict>, cut <cut>`.
- In `evals/value.md`, add the `verdict` column to the header, the separator and every row, with `-` in every existing row, and add `and the verdict (better, same, worse or not sure yet)` to the sentence of line 3 that lists the figures.
- Tests: each of the four verdicts, and the table still reads and plans.

### Task 6: feat(evals): measure near-miss skill triggers
Depends on: 2 | Files: `evals/trigger.mjs`, `evals/trigger.json`, `tests/trigger.test.mjs` | Data: `evals/trigger.json` shaped `{ "<skill>": [{ "prompt": string, "should_trigger": boolean }] }`; stdout lines `<skill> <fired>/<runs> "<prompt>" expected <yes or no>` and a last line `wrong: <n> of <m>`; read by Task 33 | Model: sonnet medium | Proof: node --import ./tests/clean-run-env.mjs --test tests/trigger.test.mjs

- `evals/trigger.json` holds 8 prompts for each of the nine skills (author, build, diagnose, document, learn, save, ship, spec, watch): 4 with `should_trigger: true` and 4 with `false`. Each `false` prompt is a near miss that belongs to another exo skill or to none. Write them from the `description` lines of the skills.
- `node evals/trigger.mjs [skill]` has no options. With a skill name it runs that skill's prompts, else all.
- For one run it starts `claude -p <prompt> --plugin-dir <repo root> --model sonnet --output-format stream-json --verbose --max-budget-usd 0.25` and reads stdout line by line. The first `tool_use` block decides: the skill fired when its `name` is `Skill` and its `input.skill` is `exo:<skill>`. The script ends the child process at that first block. A run that ends with no tool call did not fire.
- Each prompt runs twice, and a third time only when the two runs disagree. A prompt is wrong when the majority differs from `should_trigger`.
- Exit 1 when the last line counts more than 0 wrong.
- Tests put a fake `claude` first on `PATH` that prints canned stream-json lines: fired, another tool first, text only, and a split that needs a third run.

### Task 7: docs(author): accept a description edit on held-out prompts
Depends on: 1 | Files: `skills/author/SKILL.md` | Data: none (skill text, read by the model) | Model: haiku low | Proof: grep -q 'held-out half' skills/author/SKILL.md

Under Judgment, replace the bullet `- A rule a real failure showed outranks a rule that only reads well.` with this one bullet:
`- A rule a real failure showed outranks a rule that only reads well. For a description, write prompts that must fire the skill and near misses that must not, tune the edit on one half and keep it only when the held-out half gets no worse; log a dropped edit as "rejected: <what>, <why>" where the project logs its failures.`

### Task 8: feat(build): write the task brief to a file
Depends on: 2 | Files: `skills/build/scripts/next-task.mjs`, `skills/build/SKILL.md`, `tests/plan-path.test.mjs` | Data: stdout of `next-task.mjs` is `Landed: <list>`, `Next: <n> <title>` and `Brief: <absolute path>`; the file holds the full text that `nextTaskReport` returns; read by the lead at steps 2 and 3 of the loop | Model: sonnet medium | Proof: node --import ./tests/clean-run-env.mjs --test tests/plan-path.test.mjs

- `nextTaskReport` stays pure and keeps its return value.
- `main` writes that text to `scratchPath(root, 'brief-<n>.md')` from `#scratch-path` and prints only the three lines. With `Next: none` it prints as today and writes no file.
- In `skills/build/SKILL.md`, step 2 of the loop says: it prints the landed tasks, the `Next:` line and a `Brief:` path, and the file holds the task text with the plan's Decisions, Non-goals and Assumptions. Step 3 adds the `Brief:` path to what the builder gets, as the text to read first. Bring the example and the Available Scripts row in line with this.
- Tests: stdout holds no task body, and the file at the `Brief:` path holds the task section and the standing sections.

### Task 9: docs(spec): add an optional Model field to a task
Depends on: 8 | Files: `skills/spec/references/field-rules.md`, `skills/spec/references/example-plan.md`, `skills/build/SKILL.md` | Data: task field `Model: <model> <effort>`, placed before `Proof:`, read by the lead at step 3 of the loop | Model: haiku low | Proof: grep -q 'Model: ' skills/spec/references/field-rules.md && grep -q 'Model: ' skills/spec/references/example-plan.md && grep -q 'Model:' skills/build/SKILL.md && node --import ./tests/clean-run-env.mjs --test tests/plan-check.test.mjs tests/finding-consumes-list.test.mjs tests/plan-template.test.mjs

- In `field-rules.md`, add `[| Model: <model> <effort>]` to the field-line pattern of the Tasks bullet, between `[| Red: none (<reason>)]` and ` | Proof: <one command>`. Then add after the nested bullet that starts `Risk:` this nested bullet, with the same two-space indent: ``- `Model:` (optional) is `<model> <effort>` for the builder of this task, such as `haiku low` for a text edit with given wording or `opus high` for a new design. Without it the build uses its Models table.``
- In `example-plan.md`, on the Task 5 line only, put `Model: haiku low` as its own field between the `Red:` field and the `Proof:` field.
- In `skills/build/SKILL.md`, add to step 3 of the loop: ``A task line with `Model: <model> <effort>` sets the Agent tool's `model` and `effort` for that builder; else the Models table decides.``
- Change no script: the parser already keeps the field.

### Task 10: docs(build): pick the second-attempt model by cause
Depends on: 9 | Files: `skills/build/SKILL.md` | Data: none (skill text, read by the lead) | Model: haiku low | Proof: grep -q 'names a missing input' skills/build/SKILL.md

- In the Models table, rename the first cell of the second-attempt row to `Second attempt, any other failure` and keep its other cells.
- Add above it a row with the first cell `Second attempt, the report names a missing input` (a `Premise:` or `BLOCKED` line that names an absent file or fact): `exo:builder` on Sonnet at medium effort, with the missing answer in its prompt.
- In the step 4 sentence that sends a build that fails once to a fresh builder, change `on the second-attempt row of the Models table` to `on the second-attempt row of the Models table that fits its report`.

### Task 11: feat(build): derive review effort from diff size
Depends on: 10 | Files: `skills/build/scripts/next-task.mjs`, `skills/build/SKILL.md`, `tests/plan-path.test.mjs` | Data: `reviewEffort(changedLines, base)` returns `low`, `medium`, `high` or `xhigh`; stdout line `Review effort: <word> (<n> changed lines)` after `Next: none`, read by the lead at End of the run | Model: sonnet medium | Proof: node --import ./tests/clean-run-env.mjs --test tests/plan-path.test.mjs

- Changed lines are the added plus removed lines of `git diff --numstat <base>...HEAD`, where `<base>` is `defaultBase(root)` from `#plan-landed`; a binary file counts 0. When `defaultBase` is null the line is `Review effort: medium (base unknown)`.
- The base B is `environmentMs('EXO_REVIEW_LINES', 150)`. Under B the word is `low`, under 4 times B `medium`, under 16 times B `high`, else `xhigh`.
- The line is printed only together with `Next: none`.
- In End of the run step 1, replace ``with args `medium <branch>` `` by ``with args `<effort> <branch>`, where `<effort>` is the word of the `Review effort:` line that `next-task.mjs` prints with `Next: none`; with no plan it is `medium` ``.
- Tests: the ladder at its edges, the line with `Next: none`, and the variable moving the base. They run on a feature branch off the default branch, because `defaultBase` is null on the default branch.

### Task 12: feat(build): print undo commands for a landed task
Depends on: 11 | Files: `skills/build/scripts/undo-task.mjs`, `skills/build/SKILL.md`, `tests/undo-task.test.mjs` | Data: `node undo-task.mjs --plan <plan> --root <checkout> <n>` prints one `git revert --no-commit <sha>` line per commit, newest first; read by the lead on `PLAN DRIFT` | Model: sonnet medium | Proof: node --import ./tests/clean-run-env.mjs --test tests/undo-task.test.mjs

- The commits are those of task `<n>` and of every landed task that depends on it, directly or through other tasks, found with `taskCommits`, `commitsOf` and `planIdOf` from `#plan-landed` and ordered as `commitsOf` orders them.
- The script takes the last argument that does not start with `--` as `<n>` before it calls `parseFlags`, as `main` of `corrections.mjs` splits off its ids.
- It prints and never runs a revert. Its last line is `Fix commits carry no Plan-task trailer and are not listed.`
- Exit 1 with one line on stderr when the working tree is dirty, when a merge or rebase is in progress, or when task `<n>` has no `Plan-task:` commit.
- In `skills/build/SKILL.md`, the `PLAN DRIFT` route becomes: ``append a `## Log` line to the plan, then stop and hand the plan back to `exo:spec` with the builder's reason; when the reason makes a landed task wrong, add the lines that `node "${CLAUDE_SKILL_DIR}/scripts/undo-task.mjs" --plan <path> --root <checkout> <n>` prints.`` Add the Available Scripts row: `undo-task.mjs`, prints the revert commands for one landed task and the landed tasks that depend on it, `--plan <plan> --root <checkout> <n>`.
- Tests build a temp repo with the helpers of `tests/harness.mjs` and two commits that carry `Plan-task:` trailers: both shas print newest first, a dirty tree exits 1, an unlanded task exits 1.

### Task 13: feat(build): list removed test lines in the landing report
Depends on: 12 | Files: `skills/build/scripts/land-task.mjs`, `skills/build/scripts/land-check.mjs`, `skills/build/SKILL.md`, `tests/land-removed-lines.test.mjs` | Data: landing report block `Removed test lines: <n>` followed by one `- <path>: <line>` line each, read by the lead at step 4 of the loop | Model: sonnet medium | Proof: node --import ./tests/clean-run-env.mjs --test tests/land-removed-lines.test.mjs

- A removed line is a non-blank line that starts with `-` and not with `---` in `git diff --diff-filter=M --no-renames <base> <candidate> -- <test paths>`, where the two commits are `candidate.base` and `candidate.candidate` of `stageCandidate` and the test paths are `testPaths` of the changed paths (`lib/red-green.mjs`).
- `landingReport` prints the block between the gate line and the `Landed:` line, and prints nothing when no line was removed. No line of the block starts with two spaces.
- In `skills/build/SKILL.md`, add to the `GREEN` route of step 4: ``A `Removed test lines:` block in the landing report is a weakened test unless the task text asks for the removal; send it to a fix round.`` In End of the run step 1, replace `name every assertion changed since the base` by ``check each line the landing reports listed under `Removed test lines:` ``.
- Tests use `landingCheckout` and `editApp` of `tests/land-task-fixture.mjs`, `landTask` of `skills/build/scripts/land-task.mjs` and their own plan built with `compactPlanFixture` of `tests/harness.mjs`, whose task names a test file that is committed at the base: a task that deletes one assert prints the block with that line, and a task that only adds test lines prints no block.

### Task 14: feat(spec): allow a Review Focus section in a plan
Depends on: 9 | Files: `lib/plan-frame.mjs`, `skills/spec/scripts/plan-check.mjs`, `skills/spec/references/field-rules.md`, `skills/spec/references/example-plan.md`, `tests/plan-check.test.mjs` | Data: `frameOf(frame).reviewFocus` holds the text of the `## Review Focus` section or null, read by Task 15; plan-check refuses more than 5 bullets there | Model: sonnet medium | Proof: node --import ./tests/clean-run-env.mjs --test tests/plan-check.test.mjs

- `frameOf` adds `reviewFocus: frame['Review Focus'] ?? null`.
- plan-check reports one problem when the section holds more than 5 bullets.
- In `field-rules.md`, add this bullet: `- **Review Focus** (optional): at most 5 one-line bullets that tell the end-of-run review where a passing Proof could hide a fault. Omit the section when empty.`
- In `example-plan.md`, add the section after Manual checks with the one bullet `- A task saved before this change has no due date: the list must still load.`
- Tests: the example still passes, 5 bullets pass, 6 bullets fail.

### Task 15: feat(build): hand the plan's Review Focus to the end review
Depends on: 14, 13 | Files: `skills/build/scripts/next-task.mjs`, `skills/build/SKILL.md`, `tests/plan-path.test.mjs` | Data: stdout line `Review focus:` followed by the bullets of the section, printed after the `Review effort:` line, read by the lead at End of the run | Consumes: Task 14: reviewFocus | Model: sonnet low | Proof: node --import ./tests/clean-run-env.mjs --test tests/plan-path.test.mjs

- With `Next: none`, `next-task.mjs` prints `Review focus:` and the section's bullets after the `Review effort:` line. A plan with no such section prints neither.
- In End of the run step 1, after `ask it to check the diff against the plan's Decisions and Acceptance`, add ``and against the bullets under `Review focus:`, when `next-task.mjs` printed them``.
- Tests: a plan with the section prints its bullets with `Next: none`, a plan without it does not print the line.

### Task 16: docs(builder): add a context budget sentence
Depends on: 1 | Files: `agents/builder.md` | Data: none (agent text, read by the model) | Model: haiku low | Proof: grep -q 'Guard your context' agents/builder.md

Add this bullet as the last bullet under the Read heading:
`- Guard your context: read the part of a long file that you need, not all of it, and send a long command's output to a file and read its end.`

### Task 17: feat(spec): mark hub exports in the repo map
Depends on: 2 | Files: `skills/spec/scripts/repo-map.mjs`, `tests/repo-map.test.mjs` | Data: a map entry `name•N`, where N is the number of other tracked files that hold the exported name as a whole word, printed when N is 3 or more; line 2 of the map file, after `# Repository map`, is the legend `name•N: N other files use this export`; stdout stays the map path and the grep line; read by `exo:spec` at step 2 | Model: sonnet low | Proof: node --import ./tests/clean-run-env.mjs --test tests/repo-map.test.mjs

- The script keeps zero options and its line shape `<file>: <name>, <name>`.
- Tests run the script in a temp git repo: a name used by 3 other files prints as `name•3`, a name used by 2 prints bare, and the legend is line 2 of the map file.

### Task 18: feat(save): gather git facts and check staleness in handoff.mjs
Depends on: 2 | Files: `skills/save/scripts/handoff.mjs`, `skills/save/SKILL.md`, `tests/save-handoff.test.mjs` | Data: `handoff.mjs facts` prints `Written: <date>, last commit <short hash>, branch <name>`, `Committed: <paths>` and `Uncommitted: <paths>`; `handoff.mjs stale` prints `Commits since: <n>` with one line per commit, `Changed since: <paths>` and one `Missing: <path>` line per path; `handoff.mjs path` still prints one line; read by the save skill | Model: sonnet medium | Proof: node --import ./tests/clean-run-env.mjs --test tests/save-handoff.test.mjs

- `facts` and `stale` are subcommands beside `path`, with the same `--cwd` and no new option.
- `facts`: the date is today as `YYYY-MM-DD`. `Committed:` lists `git diff --name-only <base>...HEAD` with `defaultBase` from `#plan-landed`, or `none` on the default branch. `Uncommitted:` lists the paths of `git status --short`, or `none`.
- `stale`: reads the handoff of the branch, takes the hash of its `Written:` line, prints `git log <hash>..HEAD --oneline` under `Commits since: <n>`, the files changed since under `Changed since:`, and `Missing: <path>` for each backticked relative path in the handoff that no longer exists. With no handoff file, or no `Written:` line, it exits 1 with one line on stderr.
- In `skills/save/SKILL.md`, step 2 of Write the file becomes: ``Run `handoff.mjs facts` and copy its `Written:` line and its path lists into the file.`` Drop the `## Resume` bullet and its paragraph from the file template. Continue from a handoff becomes: run `handoff.mjs path`, read the file it prints, run `handoff.mjs stale`, then this text once: `Diff the work this handoff records as done against the work it still lists as next or open, name the resume point, and repeat no step it records as proven. Verify an inherited claim against the real artifact before building on it: a prior session's report is not the proof. Name what handoff.mjs stale lists as changed since, before relying on a claim.` Update the Available Scripts row to `path, facts or stale, each with [--cwd <dir>]`.
- Tests init a temp git repo with `-c user.name` and `-c user.email`: `path` prints one line, `facts` prints the head's short hash, and `stale` after one more commit prints that commit and a missing path.

### Task 19: docs(save): give ruled-out approaches their own heading
Depends on: 18 | Files: `skills/save/SKILL.md` | Data: none (skill text, read by the model) | Model: haiku low | Proof: grep -q '## Ruled out' skills/save/SKILL.md

- In the bullet on `## Evidence`, delete its last sentence `Add each approach already ruled out.`
- Add after that bullet this bullet: ``- `## Ruled out`: each approach already tried and dropped, one line each with why it failed.``

### Task 20: docs(diagnose): compare with the nearest working case
Depends on: 1 | Files: `skills/diagnose/SKILL.md` | Data: none (skill text, read by the model) | Model: haiku low | Proof: grep -q 'list every difference' skills/diagnose/SKILL.md

Step 3 becomes: `3. **Isolate.** When a sibling input or code path works, list every difference from the failing one before removing anything. Then remove inputs or branches until one more clears the symptom; two rounds with no change end it. Proven means a causal line plus a mechanism that predicts the symptom.`

### Task 21: feat(diagnose): find the polluting test in bisect.mjs
Depends on: 20, 2 | Files: `skills/diagnose/scripts/bisect.mjs`, `skills/diagnose/SKILL.md`, `tests/diagnose-bisect.test.mjs` | Data: a `--repro` command that holds the token `__FILE__` makes `bisect.mjs` search test files instead of commits and print `Polluter: <file>` or `Polluter: none`; read by the diagnose skill | Model: sonnet medium | Proof: node --import ./tests/clean-run-env.mjs --test tests/diagnose-bisect.test.mjs

- No option is added: the token inside `--repro` selects the mode.
- Candidates are the tracked files that `isTestPath` of `lib/red-green.mjs` accepts, whose file name matches `[._](test|spec)\.` or `^test_`, and that the command does not already name.
- Every probe runs in the temp worktree at HEAD, after `git reset --hard -q && git clean -fdq` there, so a file one probe wrote cannot reach the next.
- First it runs the command with the token removed. When that fails it prints `Bisect: the test fails alone`, which exits 1 as every `Bisect:` line does.
- Then it runs the command with all candidates in place of the token. When that passes it prints `Polluter: none`. Else it halves the candidate list until one file is left and prints it.
- In `skills/diagnose/SKILL.md`, add after the bullet that starts `It worked before:` this bullet: ``- It fails only after another test: `node "${CLAUDE_SKILL_DIR}/scripts/bisect.mjs" --repro "<runner> __FILE__ <failing test>"` prints the test file that pollutes it.`` Add the token form to the usage cell of the Available Scripts row.
- Tests use `commitFiles`, `git`, `gitRepository` and `run` of `tests/harness.mjs`: of four test files one writes a marker that makes the victim fail, and the script prints that file; a victim that fails alone exits 1; a clean set prints `Polluter: none`.

### Task 22: fix(document): drop the --uncovered step that throws
Depends on: 1 | Files: `skills/document/SKILL.md` | Data: none (skill text, read by the model) | Model: haiku low | Proof: test "$(grep -c -e '--uncovered' skills/document/SKILL.md)" -eq 0

The step that reads ``3. Add `--uncovered` to list only commits that did not touch the changelog; in the changelog, follow its existing format for a breaking change.`` becomes `3. In the changelog, follow its existing format for a breaking change.`

### Task 23: docs(document): fix the answer shape for how-it-works questions
Depends on: 22 | Files: `skills/document/SKILL.md` | Data: none (skill text, read by the model) | Model: haiku low | Proof: grep -q 'from trigger to effect' skills/document/SKILL.md

Add at the end of step 1 (`Pick one mode per document.`) this text: `For "how does X work" about code, give the flow from trigger to effect with file:function names, then where things live and what surprises a newcomer; state your reading of an ambiguous question and go on.`

### Task 24: feat(learn): name the kept lesson in the hook line
Depends on: 2 | Files: `skills/learn/scripts/corrections.mjs`, `skills/learn/scripts/lessons.mjs`, `skills/learn/SKILL.md`, `tests/learn-corrections.test.mjs` | Data: hook line `exo: this prompt shares words with the lesson "<name>" you kept (id <id>); exo:learn can strengthen it`; with no matching note the line stays as it is today; read by the learn skill | Model: sonnet medium | Proof: node --import ./tests/clean-run-env.mjs --test tests/learn-corrections.test.mjs

- The name is the `name:` of the note, in the project store or the personal store, whose text shares the most hashed words with the kept row, by the same `words()`, with at least `MIN_SHARED_WORDS` shared.
- The notes are those of the stores that `lessonPaths` of `lessons.mjs` lists; export it and keep the command line of `lessons.mjs` as it is. A kept row with no `words` prints the old line.
- The id stays in the line, because the skill passes it to `keep <id>`. The line stays a fact, not a command.
- In `skills/learn/SKILL.md`, the second bullet under Start quotes the new line and says the name is left out when no note matches.
- Tests: a kept row with a matching note prints the name, and one without prints the old line.

### Task 25: feat(learn): flag stale notes in lessons check
Depends on: 24 | Files: `skills/learn/scripts/lessons.mjs`, `skills/learn/SKILL.md`, `tests/learn-lessons.test.mjs` | Data: `lessons.mjs check` prints `stale: <note>: <reason>` lines on stdout and keeps its exit code; the reasons are `paths matches no tracked file`, `names a missing path <path>` and `last seen <date>`; read by the Prune step of the learn skill | Model: sonnet medium | Proof: node --import ./tests/clean-run-env.mjs --test tests/learn-lessons.test.mjs

- `paths matches no tracked file`: a `paths:` glob that matches nothing in `git ls-files`. Skipped outside a git repo.
- `names a missing path <path>`: a backticked relative path in the note body that does not exist under the repo root. Such a path is a backticked span with no space that holds `/` or ends in a file extension and does not start with `/`, `~` or `$`. Only for a store inside a git repo.
- `last seen <date>`: the newest `seen:` date is older than `environmentMs('EXO_LEARN_STALE_DAYS', 180)` days.
- The `stale:` lines print on stdout whether or not the check finds problems.
- In the Prune paragraph of `skills/learn/SKILL.md`, replace `Read the two lesson stores too and mark delete each note a check now enforces or the tree makes impossible.` by ``Run `node "${CLAUDE_SKILL_DIR}/scripts/lessons.mjs" check --dir <store>` on the two lesson stores and judge only the notes its `stale:` lines name: delete one a check now enforces or the tree makes impossible.``
- Tests: one note per reason prints its line, a fresh note prints none, and the exit code is the same with and without stale lines.

### Task 26: feat(learn): read tool calls from transcripts
Depends on: 2 | Files: `skills/learn/scripts/sessions.mjs`, `tests/learn-sessions.test.mjs` | Data: `toolCalls(file)` returns `[{ session, date, line, name, text, failed }]`, one per `tool_use` block, where `text` is the tool name plus its `command`, `file_path` or `skill` input, `line` is the transcript line number and `failed` is true when the matching `tool_result` has `is_error: true`; each entry of `promptMessages(file)` gains the same `line`; read by Task 27 and Task 28 | Model: sonnet medium | Proof: node --import ./tests/clean-run-env.mjs --test tests/learn-sessions.test.mjs

- A `tool_use` block sits in an assistant entry and its `tool_result` in a later user entry with the same `tool_use_id`.
- The script gets no command line.
- Tests: a transcript with one passing and one failing Bash call and one Skill call gives three entries with the right `failed`, `text` and `line`.

### Task 27: feat(evals): count corrections after a skill ran
Depends on: 26, 24 | Files: `evals/skill-corrections.mjs`, `skills/learn/scripts/corrections.mjs`, `tests/skill-corrections.test.mjs` | Data: `node evals/skill-corrections.mjs` prints one line `exo:<name>: corrected in <k> of <n> sessions` per skill, most corrected first; read by Task 33 | Consumes: Task 26: toolCalls | Model: sonnet medium | Proof: node --import ./tests/clean-run-env.mjs --test tests/skill-corrections.test.mjs

- It reads the transcripts of this project with `sessionFiles(projectFolder(cwd))`. A `toolCalls` entry with `name` `Skill` and a skill that starts with `exo:` is a use. `<n>` counts the sessions with a use of that skill.
- The follow-ups of a use are the next 3 typed prompts after its `line` in that session. A follow-up is a correction when its id, by `entryOf`, sits in a group of `clusters(ledger)`. `<k>` counts the sessions with at least one.
- Export from `corrections.mjs` the function `clusters` and a new `readLedger(cwd)` that reads the ledger and its verdicts with no lock, no reset and no new folder, and change no behaviour there. Pass the ledger to `clusters` with an empty verdict list, so a kept or rejected correction still counts.
- It has no options, writes nothing and exits 0. A skill with no use prints no line.
- Tests build two transcripts and a ledger in a temp config folder: one skill is corrected in 1 of 2 sessions.

### Task 28: feat(learn): store repeated failures beside the ledger
Depends on: 27, 26 | Files: `skills/learn/scripts/corrections.mjs`, `tests/learn-corrections.test.mjs` | Data: file `<name>.failures.jsonl` beside the ledger with rows `{ id, date, session, words }`; `candidates` prints a failure cluster as `<id> failed: "<text>" (<k> sessions, <first> to <last>)`; read by Task 29 | Consumes: Task 26: toolCalls | Risk: persisted format | Model: opus high | Proof: node --import ./tests/clean-run-env.mjs --test tests/learn-corrections.test.mjs

- `backfill` and `recount` (the detached step that `session-start` starts) both add one row per failed entry of `toolCalls(file)` to the failures file. `recount` reads only the transcripts changed since the failures file was last written. The row is built like `entryOf` from the entry's `text`, so the same failed call in one session gives one row. Before `words()`, each `/`, `.` and `-` in the failure text becomes a space, so a file path adds words.
- The file sits in the same folder as the ledger, with the same file mode, lock and row cap, and holds hashes only.
- Failure rows cluster only with failure rows, by the same `similar` and `MIN_SESSIONS`. `countedWords` is computed over the prompt rows and the failure rows together; only the pairing is limited to failure rows. `candidates` ranks failure clusters and prompt clusters in one list. `transcriptTexts` also maps each failure id to the `text` of its `toolCalls` entry, so `listed()` keeps a failure cluster with or without `--texts`.
- `keep` and `reject` take a failure id as they take a prompt id, and write the verdict row with the added field `failed: true`. `react()` and prompt clustering skip such rows and failure clustering reads only them, so the hook never flags a prompt against a failure. The session-start count includes failure clusters.
- Old-format case: a store with no failures file lists the same candidates as before, and the ledger file gets no new field.
- Tests add `fillers(60)` to the ledger, as the existing cluster tests do: a call that fails in 3 sessions is listed with `failed:`, a failed `Read` of one file path in 3 sessions is listed too, one that fails in 2 is not, a kept failure id is not listed again, and the old-format case.

### Task 29: feat(learn): count later clean runs of a failure
Depends on: 28 | Files: `skills/learn/scripts/corrections.mjs`, `tests/learn-corrections.test.mjs` | Data: a failure line of `candidates` ends `(<k> sessions, <first> to <last>, <m> later clean runs)` when m is above 0; a kept failure cluster with m above 0 prints `<id> kept, <m> later clean runs`; read by Task 30 | Model: opus high | Proof: node --import ./tests/clean-run-env.mjs --test tests/learn-corrections.test.mjs

- `<m>` counts the sessions dated after the cluster's last failure in which a `toolCalls` entry that did not fail is `similar` to any failure row of the cluster, with the same counted words. A kept failure is a verdict row with `failed: true`. The count is computed from the transcripts when `candidates` runs and is stored nowhere.
- A `kept` line is a fact for the model to judge; the script deletes nothing.
- Tests: a failure with two later clean sessions prints `2 later clean runs`, one with none prints the old ending, and a kept one prints its `kept` line.

### Task 30: feat(learn): mark a cluster seen in two projects as global
Depends on: 29 | Files: `skills/learn/scripts/corrections.mjs`, `tests/learn-corrections.test.mjs` | Data: a line of `candidates` ends ` global (<p> projects)` when the cluster's rows come from 2 or more project ledgers; read by Task 31 | Model: opus high | Proof: node --import ./tests/clean-run-env.mjs --test tests/learn-corrections.test.mjs

- `candidates` and the session-start count read every project's ledger and failures file in the learn folder of the config directory, by default and with no option. A project ledger is a file whose name matches `^[A-Za-z0-9-]+\.jsonl$`; its verdicts file and failures file are found by name from it.
- A cluster is listed when it has `MIN_SESSIONS` sessions in this project, as today, or `MIN_SESSIONS` sessions over all projects with at least one in this project.
- A cluster kept or rejected in the verdicts file of any project is not listed again in another.
- `--texts` reads the text of a row from another project in that project's transcript folder, named after its ledger file. When the transcript is gone the candidate prints without that line.
- The scratch-folder fallback reads this project only. No new file is written and no file mode changes.
- Tests: two project ledgers in a temp config folder with 2 sessions and 1 session of one cluster list it as `global (2 projects)` in both projects, a cluster with 3 sessions in another project only is not listed here, and a verdict in one project hides it in the other.

### Task 31: docs(learn): mine failures and global lessons
Depends on: 30, 25 | Files: `skills/learn/SKILL.md` | Data: none (skill text, read by the model) | Model: haiku low | Proof: grep -q 'later clean runs' skills/learn/SKILL.md && node --import ./tests/clean-run-env.mjs --test tests/learn-mine-texts.test.mjs

- Add at the end of step 1 of Mine: ``A line with `failed:` is a tool call that failed in that many sessions, `<m> later clean runs` counts the sessions where it worked afterwards, and `global (<p> projects)` marks a cluster seen in other projects too.``
- Add at the end of step 5 of Mine: ``Write a `global` lesson to the personal store. Keep a failure only as the fix that works, and reject one with later clean runs unless the user still wants it. For a line `<id> kept, <m> later clean runs`, offer to delete that note.``
- Keep the first words of step 1, its command and its `other session:` text, because `tests/learn-mine-texts.test.mjs` pins them.

### Task 32: docs(contributing): say why the hooks stay detect-only
Depends on: 1 | Files: `CONTRIBUTING.md` | Data: none (docs, read by people) | Model: haiku low | Proof: grep -q 'mnemo' CONTRIBUTING.md

Add at the end of the paragraph under the Hook heading, after `It calls no model and no network.`, this text: `The hooks only detect and inject no rule per prompt: the xyrlan/mnemo README reports that per-prompt rule injection lifted rule-following from 41.0% to 72.1% yet prevented 0.005 repeats per session, because 62.5% of the corrected rules were already in CLAUDE.md or auto-memory, and a fixed block at session start did as well as per-prompt retrieval.`

### Task 33: docs(contributing): describe the new checks, eval tools and review effort
Depends on: 32, 3, 5, 6, 7, 11, 27 | Files: `CONTRIBUTING.md` | Data: none (docs, read by people) | Model: haiku low | Proof: grep -q 'evals/trigger.mjs' CONTRIBUTING.md && grep -q 'EXO_REVIEW_LINES' CONTRIBUTING.md && grep -q 'script options' CONTRIBUTING.md && grep -q 'skill-corrections' CONTRIBUTING.md

- In the paragraph that lists what each check fails on, add: ``The `script options` check fails when a script declares more options than at the merge-base with `origin/main`, or a new script more than 5. The `positional literals` check fails on a `$1`-style literal in a skill, agent or output-style file.``
- At the end of the first paragraph under the Evals heading, add: ``A measured case runs twice, and a third time only when the two runs split; `evals/value.md` shows a verdict per part (better, same, worse or not sure yet). `node evals/trigger.mjs <skill>` runs the near-miss prompts of `evals/trigger.json` and counts wrong triggers: tune a description on one half of a skill's prompts and accept it on the other half. Both call a model, so run them only before a release. `node evals/skill-corrections.mjs` calls no model and prints, per exo skill, in how many sessions a repeated correction followed it; record that count in `evals/failures.md` before changing the skill.``
- In the line on the end-of-run review, replace ``at effort `medium` `` by ``at the effort that `next-task.mjs` derives from the diff size (`EXO_REVIEW_LINES`, default 150 changed lines)``.

### Task 34: docs(changelog): list the repo-survey changes
Depends on: 33, 15, 16, 17, 19, 21, 23, 31 | Files: `CHANGELOG.md` | Data: none (docs, read by people) | Model: haiku low | Proof: grep -q 'undo-task' CHANGELOG.md && grep -q 'skill-corrections' CHANGELOG.md && grep -q 'uncovered' CHANGELOG.md

Add these lines under `## Unreleased`, each in the named group, and create a group that is missing.
Under `### Added`:
- `script options` check: a script may not gain an option, and a new script holds at most 5.
- `positional literals` check: no `$1`-style literal in a skill, agent or output-style file.
- `evals/trigger.mjs` and `evals/trigger.json`: near-miss prompts that must not trigger a skill.
- `evals/skill-corrections.mjs`: sessions with a repeated correction after a skill ran.
- `evals/value.md` has a `verdict` column: better, same, worse or not sure yet.
- `undo-task.mjs` prints the revert commands for a landed task.
- A plan task may name its builder with `Model: <model> <effort>`.
- A plan may hold a Review Focus section of at most 5 bullets for the end review.
- `handoff.mjs facts` and `handoff.mjs stale` gather the git facts of a handoff and what changed since.
- `bisect.mjs` finds the test file that pollutes another test when `--repro` holds `__FILE__`.
- learn mines tool calls that fail in 3 sessions, counts their later clean runs and marks a cluster seen in 2 projects as global.
- `lessons.mjs check` prints `stale:` lines for notes.
- The repo map marks an export that 3 or more other files use as `name•N`.
Under `### Changed`:
- `evals/value.mjs` runs a case twice and a third time only on a split.
- `next-task.mjs` writes the task brief to a file and prints its path.
- The end-of-run review takes its effort from the diff size (`EXO_REVIEW_LINES`).
- The second attempt of a task runs on Sonnet when the report names a missing input.
- The landing report lists removed test lines.
- The learn hook line names the kept lesson.
- A handoff has a Ruled out heading, and its Resume text lives in the save skill.
- diagnose compares with the nearest working case before it removes anything.
- document gives a fixed shape to a how-it-works answer.
- author accepts a description edit only on held-out prompts.
- The builder guards its context.
Under `### Fixed`:
- document no longer names the `--uncovered` option, which `release-notes-draft.mjs` rejects.
