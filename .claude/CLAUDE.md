# exo

Source of Claude Code plugin `exo`. Layout → `README.md`; commands and internals → `CONTRIBUTING.md`.

## Workflow

- Main checkout stays on `main`; every edit runs in a worktree, because exo loads in place from this checkout.
- Run start → unpushed commits on `main` from an earlier session: squash and push them per the session-push bullet below first; then `git pull --ff-only` on `main`, then remove every worktree and branch, local and remote, merged into `main`, each worktree per the removal bullet below. Also `git fetch --prune`, then delete each local branch whose upstream is gone (`git branch -vv` shows `: gone]`); `git branch --merged` misses squash merges.
- Lead only orchestrates, overriding the user rule "Other work → do it directly" because exo loads in place from the main checkout: every edit, fix and failed-check repair → worktree subagent, one concern each; independent parts in parallel; brief with two unrelated parts → two subagents.
- `CHANGELOG.md` → outside a run, only the lead writes it, so subagent branches never conflict on it; every plan here ends with a task writing its `## Unreleased` line, so the line lands in the run's squash commit.
- `exo:spec` → lead runs it itself; code reading goes to `exo:locate-code`; the lead writes the brief itself.
- Build → `exo:build <brief>` in the lead session, which lands each task through `exo:run-unit` subagents; resume → `exo:build <brief>` again, it reads landed tasks from `Plan-task:` commits. Headless `exo run` → only from the user's terminal; it refuses inside Claude Code. A plan task lands only through that loop; lead and subagents commit no plan task on the run branch.
- Plans here → `Land: local` and `Commit: <type(scope): subject>`; after `verify` passes, lead squashes the run branch onto `main` as that commit per the `Then →` bullet; `main` stays unpushed until the session push, no pull request.
- `exo:improve` run → its own plan: own loop in its own worktree on `improve/<tag>`, worker subagents do the edits, no `exo:spec` or `exo:build`; at Stop the lead squashes the kept commits per `Then →` and writes the CHANGELOG line.
- Run task blocked → its partial work to a hint file such as `.exo/carry/task<n>-partial.patch`, run tree reset; not a commit on the run branch. After that reset, lead fixes the plan (checked with `node skills/spec/scripts/plan-check.mjs --loop --run --plan <plan> --root <run worktree>`) or the cause in a worktree subagent, then reruns `exo:build`.
- Gate or Success criterion repair on run branch → `fix(<scope>):` commit, no `Plan-task:` trailer; else the verify gate flags its files `UNPLANNED <file>`.
- Verify → one fresh subagent briefed with the skill and its inputs only, first brief line `exo-kind: review`, no checks beyond the skill's; handover between phases → the brief and `.exo/` files.
- Non-run subagent work → land in one integration worktree under `.worktrees/`: merge subagent branches, fetch, rebase onto `origin/main`; after rebase, every line of the change stays under `## Unreleased`.
- Then → `node lib/check-cache.mjs --query "npm run check"` first, `pass` skips the check, `miss` runs `npm run check` once, output to a log; read back only `SUMMARY` and failing lines; squash the branch onto `main` as one Conventional Commit (`git merge --squash <branch>`, then `git commit`) with every branch `Evidence:` and `Proof:` line copied into the commit body; no push, no pull request.
- After squash → remove every worktree and branch the change created, local and remote; delete a branch with `git branch -D <name>`, in its own command.
- Session push → at session end, or when the user asks to push: `git reset --soft origin/main`, then `git commit` one Conventional Commit; subject names the session's main change, type = the highest in the batch (`feat` over `fix` over the rest), body has one line per squashed change subject plus every `Evidence:`, `Proof:` and `Drops:` line; then push `main` directly, so GitHub gets one commit per session.
- Remove worktree → from main checkout, one command per worktree: `node skills/build/scripts/remove-worktree.mjs --kept --worktree .worktrees/<name> --run .`. Not plain `git worktree remove`: it deletes the excluded `.exo/` with exit 0.
- `remove-worktree.mjs` → output not piped away, exit not masked; it refuses → leave that worktree and its branch in place, report 2-3 options to user; no `--force`.
- Stash → subagent runs no `git stash`, all worktrees share one stash list; cleanup drops a stash made on a run branch once its content is on `main`, every other stash stays untouched.
- Every shell wait loop, such as `until <condition>; do sleep N; done` → deadline: counter inside loop, exit with error after a set number of rounds. Not GNU `timeout`; stock macOS lacks it.
- This workflow outranks the workspace question in `skills/build/references/workspace.md` and the pull-request route in `ship`: ask nothing about where to commit.
- Report that changed exo → exo loads in place from this checkout, so a new session runs it; action line tells user to run `/reload-plugins` only for the open session.

## Principles

- Mistake recurs across runs or reviews → add a check to `npm run check` or a fix on its code path, not a new hook or another prose line; a hook adds overhead to every session.
- Plan task mixes a no-behavior-change edit with a behavior change → split into two tasks, structural first.
- Subagent report claims a passing check or a code fact → read the proof output line and cited file before accepting.
- Run log or unit return shows looping, unrequested functionality or weakened tests → send that agent one SendMessage correction first; next return still drifts → stop the run, repair the cause, then resume.
- New skill, agent or run stage → add only after a recorded failure the existing parts cannot fix.
- Subagent commit → one purpose, made only after its proof passes; command result in the commit body → a `Proof: <command> → <result>` line, not `Evidence:`.
- Brief leaves a choice open → subagent returns the competing readings to the lead, not a silent pick.
- Build speed or cost idea → run `node benchmarks/speed-ledger.mjs --index` first (prints the index only), pass the `benchmarks/speed-ledger.md` path to every idea agent's brief, add each tested or rejected idea as a line in `benchmarks/speed-ledger.jsonl`, then run `node benchmarks/speed-ledger.mjs --render`.

## Commands

- `npm run check` gates every commit; clean run ends `SUMMARY` with `FAIL=0 WARN=0 UNRUN=0`; lead runs it once, in background, output to a log; delegate runs only its proof.
- Plan tasks here → `Land gate: npm run validate:static` (static checks, no test suite); `npm run check` runs once as Success criterion.
- Paid eval → quick tier first; full tier only for an idea that passes it; `npm run check` flags a paid `benchmarks/*.mjs` entry point with no `--dry-run` and no quick default tier.

## Editing

- Skill, agent, rule, hook or `CLAUDE.md` edit → read `skills/edit-skills/references/instruction-style.md` first, follow it.
- Design of a prompt, context, agent, tool, harness or eval → read `docs/principles/README.md` first, open only the page it names.
- Bare skill name in a skill or prompt body = `exo:<name>`.
- New value → derive it from repo, manifests or harness, else one overridable default in run.json `defaults` (`lib/run-providers.json`, `~/.config/exo/run.json`) or an `EXO_*_MS` var via `environmentMs` (`lib/script-flags.mjs`); hardcode only when needed and more useful.

## Release

- Each change → one line under `## Unreleased` in `CHANGELOG.md`, in `### Added`, `### Changed`, `### Fixed` or `### Removed`; raise no version.
- Release → weekly schedule in `.github/workflows/release.yml` cuts it when `## Unreleased` holds an entry; user asks for one sooner → lead runs `gh workflow run release.yml`, optional `-f level=patch|minor|major`. A push to `main` releases nothing. Never run `npm run bump`, `git tag v<version>` or `gh release create` by hand; a hand-cut version collides with the workflow's.
- Change user should read first → at most three bold lead sentences under `### Highlights` in `## Unreleased`, in the commit that records it, not in a release commit.
