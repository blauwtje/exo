# exo

Source of the Claude Code plugin `exo`. `README.md` explains the layout and `CONTRIBUTING.md` the
commands and internals; this file only names what a session here gets wrong without it.

## Commands

- `npm run check` is the gate before any commit. A clean run ends `SUMMARY PASS=15 FAIL=0 WARN=0 UNRUN=0`.
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
- A release runs only when the user asks for one: write at most three bold lead sentences under `### Highlights` in `## Unreleased`, run `npm run check`, then `npm run bump` (it reads the level off those sections), commit `chore(release): <version>`, and `git tag -a v<version> -m "exo <version>"`. The push waits for the finish question. After a push, `npm run --silent release-notes > "$(git rev-parse --git-dir)/release-notes.md"`, `gh release create v<version> --title "v<version>" --notes-file "$(git rev-parse --git-dir)/release-notes.md"`, then `claude plugin marketplace update blauwtje` and `claude plugin update exo@blauwtje`, and tell the user to restart Claude Code.

## Evals cost real money

<!-- Measured 2026-09-18 by summing costUsd and durationSeconds over evals/results/*/aggregate-result.json; stale once more runs land there. -->
The 37 runs recorded under `evals/results/` cost $83.87 and 170 minutes of wall clock, so the cheap
path is the default one and every rule below exists to keep it that way.

- Run no eval for a change that does not alter skill behavior. Documentation, the verifier, the changelog and this file change nothing a grader can see.
- Run only the case the change touched, with `node eval-case.mjs --case <name>`, never the 26-case suite: every run of every case pays its own judge call.
- Iterate with `--mode draft` (3 runs, no-plugin arm) and take a verdict only from `--mode full`, because at 3 runs one answer moves a pass rate by a third.
- Judge a verdict on the no-plugin arm, the cold reader. Add `--arm both` only when `skills/savings/SKILL.md` or the session hook's text changes, because that text is all that differs between the arms, and `--arm both` doubles the runs: the most expensive pass on record is $6.78 for one case that way.
- `--ablation with-without` is the CLI default whenever a plugin resolves and doubles the runs again. `eval-case.mjs` passes `--ablation none` already; a direct `claude plugin eval .` needs it too unless the baseline is the question.
- Pass `--max-cost-usd 5` on any direct `claude plugin eval` call. It is the ceiling the runner's own docs recommend over tight per-run limits, it aborts with exit 2 rather than overrunning, and nothing in this repo sets it today.
- Give every new case a `timeout_seconds` that fits what its graders check. The default is 300 (max 3600), and a run that outruns it is recorded as `timed out after 300s` yet still graded on its partial transcript, so it scores 0 and reads as a real failure. `implementing-inits-a-new-folder` and `planning-plans-a-new-folder` need `timeout_seconds: 900` for that reason.
- `max_turns` defaults to 10; every case here sets its own, because hitting the cap is a run error that lowers the score.
- Prefer a free grader when one can express the check: `regex`, `tool_used`, `tool_order` and `file_exists` are computed from the transcript and cost nothing, while `llm` and `baseline` call a judge. 28 of this repo's 33 graders are `llm`, which is why almost every run pays.
- `eval-case.mjs` pins `JUDGE_MODEL = 'sonnet'`; the CLI's own default is `haiku`. Sonnet is the deliberate choice for these rubrics, so do not widen it to new scripts without asking.
- **IMPORTANT:** a red eval is reported to the owner with its numbers, never chased with reruns. Two verification passes per change is the maximum; after the second, stop and report.

## Environment

- The session hook pins `"shell": "bash"` in `hooks.json`: without it, a Windows host without Git Bash
  falls back to PowerShell, which cannot run the script. Shell form, not `args`, because Claude Code
  then resolves the shell itself instead of looking up `bash` on `PATH`.
- The session hook stays `bash` with `jq`; a CRLF shebang fails silently on Windows, so `.gitattributes` forces LF.
