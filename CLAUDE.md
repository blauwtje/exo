# exo

Source of the Claude Code plugin `exo`. `README.md` explains the layout and `CONTRIBUTING.md` the
commands and internals; this file only names what a session here gets wrong without it.

## Commands

- `npm run check` is the gate before any commit. A clean run ends `SUMMARY PASS=19 FAIL=0 WARN=0 UNRUN=0`.
- `npm test` prints Node's spec reporter, which marks a failure `✖`, not `not ok`: a grep of its log for `not ok` finds nothing while tests fail.
- `npm run check` runs the tests once, inside the verifier's `skill script behavior` check, which uses the TAP reporter: its FAIL line names each failing test as a `not ok` line.
- `CONTRIBUTING.md` holds the rest of the command table, the hook wiring, the delegate models and the savings internals.

## Editing a skill

- Every skill or delegate-prompt edit loads the `skills-tool` skill first; it carries the shape and size rules, and `verify.mjs` is what enforces them.
- Skills are namespaced `exo:<name>` when invoked; a bare name inside a skill or prompt body means that namespaced skill.
- `verify/budgets.mjs` names the skills the full verifier checks; every other skill still passes the frontmatter, portable-language and description-budget checks, so add a skill there when it reaches the shape `skills-tool` describes.

## Changelog and release

- A change to this plugin adds one line under `## Unreleased` in `CHANGELOG.md`, in its `### Added`, `### Changed`, `### Fixed` or `### Removed` section. It bumps no version and pushes nothing, because users receive a change only through a release.
- The verifier's `plugin version` check fails while the tree differs from `origin/main` and `## Unreleased` is empty, and when a raised version has no dated changelog section: record the change, or raise the version with `npm run bump`, never by hand.
- A merge to `main` cuts the release: `.github/workflows/release.yml` runs `npm run check`, `npm run bump`, commits `chore(release): <version>`, tags `v<version>` and publishes the GitHub Release, and a merge whose `## Unreleased` is empty cuts nothing. Never run `npm run bump`, `git tag v<version>` or `gh release create` by hand: a hand-cut version collides with the next merge.
- A change the user should read about first carries at most three bold lead sentences under `### Highlights` in `## Unreleased`, written in the pull request that records the change, never in a release commit.
- Once `gh run list --workflow release.yml --limit 1` shows the release succeeded on the merge, the session installs it without being asked: it runs `claude plugin marketplace update blauwtje`, then `claude plugin update exo@blauwtje`, and tells the user to restart Claude Code, which is the one step left to them.
- After that update it removes every version folder under the config directory's `plugins/cache/blauwtje/exo/` except the new one and the one this session loaded, because a running session still reads its hooks and skills from the version it started on, and it lists the folders before removing them.

## Evals cost real money

<!-- Measured 2026-09-18 by summing costUsd and durationSeconds over evals/results/*/aggregate-result.json; stale once more runs land there. -->
Every run recorded under `evals/results/` cost real money and minutes of wall clock: the `costUsd` and `durationSeconds` of each top-level `aggregate-result.json` there add up to today's totals. The cheap path is the default one and every rule below exists to keep it that way.

- Run no eval for a change that does not alter skill behavior. Documentation, the verifier, the changelog and this file change nothing a grader can see.
- Run only the case the change touched, with `node eval-case.mjs --case <name> --arm <arm>`, never the whole suite: every run of every case pays its own judge call.
- Iterate with `--mode draft` (3 runs) and take a verdict only from `--mode full`, because at 3 runs one answer moves a pass rate by a third.
- `--ablation with-without` is the CLI default whenever a plugin resolves and doubles the runs. `eval-case.mjs` passes `--ablation none` already; a direct `claude plugin eval .` needs it too unless the baseline is the question.
- Pass `--max-cost-usd 5` on any direct `claude plugin eval` call; `eval-case.mjs` passes it to each runner process already, as `MAX_COST_USD`. It is the ceiling the runner's own docs recommend over tight per-run limits, and it aborts with exit 2 rather than overrunning, which `eval-case.mjs` reports as a stopped run with no verdict.
- Give every new case a `timeout_seconds` that fits what its graders check. The default is 300 (max 3600), and a run that outruns it is recorded as `timed out after 300s` yet still graded on its partial transcript, so it scores 0 and reads as a real failure. `implementing-inits-a-new-folder` and `planning-plans-a-new-folder` need `timeout_seconds: 900` for that reason.
- `max_turns` defaults to 10; every case here sets its own, because hitting the cap is a run error that lowers the score.
- Where text sits, how it is laid out and whether a literal appears is a free grader (`regex`, `tool_used`, `tool_order`, `file_exists`), never an `llm` criterion: a free grader costs nothing and reads every run the same way, while a second judge reversed 45% of the one-word judge's failed verdicts. `tests/evals.test.mjs` fails a new case without a free grader and an llm criterion that words layout; `CONTRIBUTING.md` `### What a judge may grade` holds the rule and the measurement.
- A plan's `## Final verification` gates an eval on the `GATE PASS` line a full `eval-case.mjs` run prints, never on a count such as `(3/3)`: n of n fails a flawless skill four times in ten under that judge. `GATE DISPUTED` is settled by reading `judge-reasons.json`, not by a rerun, and a case that gates a plan carries `runs: 5`.
- A case grants no tool unless its `prompt.md` lists `allowed_tools`, so a run cannot `Read` a skill's `references/`: a rule a case grades sits in the `SKILL.md` body, or the case grants `Read`.
- A run starts in an empty working directory, and `context.add_dirs` in a `case.yaml` copies nothing into it: it only grants a read of the folder where it sits. A case that needs files names a `context.scaffold_script` that writes them, and `eval-case.mjs` passes `--scaffold` for such a case; a direct `claude plugin eval` call needs the flag too.
- `eval-case.mjs` pins `JUDGE_MODEL = 'sonnet'`; the CLI's own default is `haiku`. Sonnet is the deliberate choice for these rubrics, so do not widen it to new scripts without asking.
- **IMPORTANT:** a red eval is reported to the owner with its numbers, never chased with reruns. Two verification passes per change is the maximum; after the second, stop and report.

## Environment

- The session hook pins `"shell": "bash"` in `hooks.json`: without it, a Windows host without Git Bash
  falls back to PowerShell, which cannot run the script. Shell form, not `args`, because Claude Code
  then resolves the shell itself instead of looking up `bash` on `PATH`.
- The session hook stays `bash` with `jq`; a CRLF shebang fails silently on Windows, so `.gitattributes` forces LF.
