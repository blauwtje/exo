# Review reliability (#107, #108, #111)

## Goal
`verify`'s branch review loses no review and no finding without saying so: every reviewer's missing report ends the turn as `BLOCKED`, a demoted `fix` finding is counted aloud, the fixer leaves text a landed task removed and reverts a fix the static gate rejects, a test-covered output-only script diff gets no model review, and a relative `--root` works.

## Decisions
All closed by exo on the user's standing instruction to take the recommended option; rejected alternative per decision in brackets.
- Which findings reach the fixer (#107 with #112): both halves. `agents/review-branch.md` requires a `  Probe: <command>` line under each `fix` finding, pointing to the `## Probe` rules in `skills/verify/references/review-rules.md`, and `merge-reviews.mjs` keeps demoting a probe-less `fix` finding to `report` but prints a second stdout line `DEMOTED <n> fix finding(s) to report: no Probe: line under them` when `<n>` is 1 or more. [Rejected: reviewer rule only, which leaves a skipped probe silent again; or dropping the demotion, which hands the fixer findings `run-probes.mjs` then fails.]
- Demotion count lives on its own stdout line, not in the `verdict=` return line, so `fix=` parsing in verify step 3 and `benchmarks/lean-gates-metrics.mjs` stays unchanged. [Rejected: a `demoted=` field in the return line.]
- Removed-text check (#107): the fixer prompt `skills/build/review-fixer-prompt.md` runs `git log <base>..HEAD --format='%h %(trailers:key=Plan-task,valueonly)' -S '<one line of that text>' -- <file>` before a fix that adds a rule, line or block back; a listed commit with a `Plan-task:` value → no edit, `reported: removed by <sha> (Plan-task <value>)`. [Rejected: a reviewer-side rule, since the reviewer only reads each task's own diff.]
- Token ceiling (#107): stated generically in the fixer prompt. After its fixes the fixer runs the plan's `Land gate:` command unless it is `none` or a full suite (`npm test`, `npm run check`, `node --test`); a failing line naming a file a fix edited → revert that fix at once, no second attempt, `reported:` with that line. In exo the gate is `npm run validate`, whose body-budget check names a skill or agent body over its ceiling. [Rejected: lead reverting in `skills/verify/references/repair.md` after the full gate rerun, which costs a second full gate run; and an exo-only token-measuring script the fixer cannot use in other repositories.]
- Output-only script diff (#107, from #105): `taskReviewer` in `skills/verify/scripts/pick-reviewer.mjs` returns `none (output only, test covered)` for a task without `Risk:` when its commits change a test file and every added or removed line in its non-test script files (`SCRIPT_EXTENSIONS`) is blank, a comment (`//`, `/*`, `*`, `#`) or holds a `console.log|error|warn|info(`, `process.stdout.write(` or `process.stderr.write(` call; any other line keeps the light reviewer. Test file = the `TEST_FILE` pattern now private in `skills/verify/scripts/verify.mjs`, moved to `pick-reviewer.mjs` as an export that `verify.mjs` imports. [Rejected: a plan-declared `Output only` field, which a planner forgets; and detecting string-literal edits anywhere, which a regex cannot do safely.]
- Relative `--root` (#108): `main()` in `verify.mjs` resolves `flags.root` with `path.resolve` before `process.chdir` and passes the absolute path to `runGate`. [Rejected: resolving inside `runGate` or in `lib/plan-tasks.mjs` `commitsOf`, which other callers already call with absolute roots.]
- Reviewer without report (#111): `agents/review-branch.md` `## Report` says the report file is the deliverable, so a general no-report-files rule does not apply. `skills/verify/references/review-rules.md:14` changes: a reviewer return with no report file at its report path, whatever its return line → still pass that path to `merge-reviews.mjs`, which merges it as `BLOCKED`; a merged `verdict=BLOCKED` → end the turn with its report, naming each task without a report; no resume, no redispatch. The `unreviewed (turn cap)` route goes. [Rejected: keeping the turn-cap skip, which the owner ruled out on #111.]
- Tasks 4, 5 and 6 edit instruction text → each follows `skills/edit-skills/references/instruction-style.md`.
- `skills/verify/SKILL.md` stays untouched: its body sits at 749 of its 750-token ceiling; every new verify rule goes into `references/review-rules.md`.
- `agents/review-branch.md` body sits at 742 of 750 tokens: its task compresses existing lines per `skills/edit-skills/references/instruction-style.md` `## Compress` to make room, drops no rule, and keeps every phrase `tests/agents.test.mjs` and `tests/review-no-behavior.test.mjs` match.

## Acceptance
- `node skills/verify/scripts/verify.mjs --plan <plan> --root .worktrees/<name> --base main` run from the repository root prints the same lines as with the absolute root (Task 1; seam: `verify.mjs` command in `tests/verify-gate.test.mjs`).
- `merge-reviews.mjs` given a report with a probe-less `fix` finding prints `fix=0` and a `DEMOTED 1` line (Task 2; seam: the command in `tests/merge-reviews.test.mjs`).
- `pick-reviewer.mjs --task <n>` prints `none (output only, test covered)` for a task changing only a `process.stdout.write(` line plus a test file, and the light reviewer once a logic line changes (Task 3; seam: the command in `tests/pick-reviewer.test.mjs`).
- `agents/review-branch.md` names the report file as the deliverable and requires a `Probe:` line per `fix` finding (Task 4; seam: `tests/agents.test.mjs`).
- `review-rules.md` sends a reviewer without report to `merge-reviews.mjs` as `BLOCKED` and holds no `unreviewed (turn cap)` (Task 5).
- `review-fixer-prompt.md` holds the `git log -S` removed-text check and the static Land gate revert rule (Task 6).
- The Success criterion passes.

## Plan basis
Repository: /Users/thomash/Documents/Code/personal/plugins/exo/.worktrees/review-reliability
Branch: fix/review-reliability
Worktree setup: none
Land gate: npm run validate
Lint: none
Allow: none

## Success criterion
`npm run check`

## Checkpoint
- Blocks first: Task 1.
- Parallel: Tasks 1, 2, 4, 5 and 6; Task 3 after Task 1.
- Shared state: `skills/verify/scripts/verify.mjs` (Tasks 1, 3).
- Smallest safe split: one task per concern; the shared `verify.mjs` serialized by Depends on.

## Tasks
### Task 1: fix(verify): resolve a relative --root before the gate changes into it
Depends on: none | Files: `skills/verify/scripts/verify.mjs`, `tests/verify-gate.test.mjs` | Data: the absolute root `main()` computes with `path.resolve(flags.root)` before `process.chdir`, passed to `runGate` | Proof: node --test tests/verify-gate.test.mjs
### Task 2: feat(verify): print how many fix findings merge-reviews demoted and why
Depends on: none | Files: `skills/verify/scripts/merge-reviews.mjs`, `tests/merge-reviews.test.mjs` | Data: a `demoted` count on the object `mergeReviews` returns, printed as a second stdout line `DEMOTED <n> fix finding(s) to report: no Probe: line under them` only when above 0 | Proof: node --test tests/merge-reviews.test.mjs
### Task 3: feat(verify): send a test-covered output-only script diff to no model review
Depends on: 1 | Files: `skills/verify/scripts/pick-reviewer.mjs`, `skills/verify/scripts/verify.mjs`, `tests/pick-reviewer.test.mjs` | Data: an exported `TEST_FILE` RegExp moved from `verify.mjs` and a `taskDiff` string (`git show --format= --no-renames -U0` of the task's shas) as `taskReviewer`'s fourth argument, giving `none (output only, test covered)` | Proof: node --test tests/pick-reviewer.test.mjs
### Task 4: fix(review-branch): require a Probe line per fix finding and name the report file the deliverable
Depends on: none | Files: `agents/review-branch.md`, `tests/agents.test.mjs` | Data: two rules in the agent's `## Report` section, the body compressed to stay within the 750-token agent ceiling | Proof: node --test tests/agents.test.mjs
### Task 5: fix(verify): report a branch reviewer without its report file as BLOCKED
Depends on: none | Files: `skills/verify/references/review-rules.md` | Data: the `## Dispatch` bullet at line 14 replaced by the no-report-file rule that merges the path as `BLOCKED` and ends the turn | Proof: grep -n "no report file" skills/verify/references/review-rules.md
### Task 6: fix(build): keep the review fixer off text a landed task removed and off fixes the static gate rejects
Depends on: none | Files: `skills/build/review-fixer-prompt.md` | Data: two rules in the fenced prompt text, the `git log -S` removed-text check and the `Land gate:` revert, within the 750-token stage-prompt limit | Proof: grep -n "Plan-task" skills/build/review-fixer-prompt.md
