# exo

Source of Claude Code plugin `exo`. Layout → `README.md`; commands and internals → `CONTRIBUTING.md`.

## Workflow

- Main checkout stays on `main`; every edit runs in a worktree, because exo loads in place from this checkout.
- Run start → `git pull --ff-only` on `main`, then remove every worktree and branch, local and remote, merged into `main`, each worktree per the removal bullet below. Also `git fetch --prune`, then delete each local branch whose upstream is gone (`git branch -vv` shows `: gone]`); `git branch --merged` misses squash merges.
- Lead only orchestrates: every edit, fix and failed-check repair → worktree subagent, one concern each; independent parts in parallel; brief with two unrelated parts → two subagents.
- `CHANGELOG.md` → outside a run, only the lead writes it, so subagent branches never conflict on it; every plan here ends with a task writing its `## Unreleased` line, so the line lands in the run's squash commit.
- `exo:spec` → lead runs it itself; code reading goes to `exo:locate-code`; the lead writes the brief itself.
- Build → `node skills/build/scripts/exo-cli.mjs run <brief> --detach`, not `exo:build` in the lead session; resume → `run --resume <run-id> --detach`; after either, the lead ends its turn and wakes only on park or finish. A plan task lands only through that loop; lead and subagents commit no plan task on the run branch.
- Plans here → `Land: local` and `Commit: <type(scope): subject>`; `land-run` rebases, reruns the Success criterion and squashes the run onto `main` as that commit; lead reads the run report, then pushes `main` directly, no pull request.
- Run task blocked → its partial work to a hint file such as `.exo/carry/task<n>-partial.patch`, run tree reset; not a commit on the run branch. After that reset, lead fixes the plan (checked with `node skills/spec/scripts/plan-check.mjs --loop --run --plan <plan> --root <run worktree>`) or the cause in a worktree subagent, then resumes the run.
- Gate or Success criterion repair on run branch → `fix(<scope>):` commit, no `Plan-task:` trailer; else the verify gate flags its files `UNPLANNED <file>`.
- Verify → one fresh subagent briefed with the skill and its inputs only, no checks beyond the skill's; handover between phases → the brief and `.exo/` files.
- Non-run subagent work → land in one integration worktree under `.worktrees/`: merge subagent branches, fetch, rebase onto `origin/main`; after rebase, every line of the change stays under `## Unreleased`.
- Then → `node lib/check-cache.mjs --query "npm run check"` first, `pass` skips the check, `miss` runs `npm run check` once, output to a log; read back only `SUMMARY` and failing lines; squash the branch onto `main` as one Conventional Commit (`git merge --squash <branch>`, then `git commit`); push `main` directly, no pull request.
- After push → remove every worktree and branch the change created, local and remote; delete a branch with `git branch -D <name>`, in its own command.
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
- Detached run log shows looping, unrequested functionality or weakened tests → stop the run, repair the cause, then resume.
- New skill, agent or run stage → add only after a recorded failure the existing parts cannot fix.
- Subagent commit → one purpose, made only after its proof passes.
- Brief leaves a choice open → subagent returns the competing readings to the lead, not a silent pick.

## Commands

- `npm run check` gates every commit; clean run ends `SUMMARY` with `FAIL=0 WARN=0 UNRUN=0`; lead runs it once, in background, output to a log; delegate runs only its proof.
- Plan tasks here → `Land gate: npm run validate:static` (static checks, no test suite); `npm run check` runs once as Success criterion.
- `npm test` → spec reporter, failure marked `✖`, not `not ok`. `npm run check` → TAP, its FAIL line lists `not ok` lines.

## Editing

- Skill, agent, rule, hook or `CLAUDE.md` edit → read `skills/edit-skills/references/instruction-style.md` first, follow it.
- Bare skill name in a skill or prompt body = `exo:<name>`.
- New value → derive it from repo, manifests or harness, else one overridable default in run.json `defaults` (`lib/run-providers.json`, `~/.config/exo/run.json`) or an `EXO_*_MS` var via `environmentMs` (`lib/script-flags.mjs`); hardcode only when needed and more useful.

## Release

- Each change → one line under `## Unreleased` in `CHANGELOG.md`, in `### Added`, `### Changed`, `### Fixed` or `### Removed`; raise no version.
- Release → weekly schedule in `.github/workflows/release.yml` cuts it when `## Unreleased` holds an entry; user asks for one sooner → lead runs `gh workflow run release.yml`, optional `-f level=patch|minor|major`. A push to `main` releases nothing. Never run `npm run bump`, `git tag v<version>` or `gh release create` by hand; a hand-cut version collides with the workflow's.
- Change user should read first → at most three bold lead sentences under `### Highlights` in `## Unreleased`, in the commit that records it, not in a release commit.

## Environment

- `hooks/hooks.json` keeps `"shell": "bash"`, else a Windows host without Git Bash falls back to PowerShell; hook command → shell form, not `args`, so Claude Code resolves the shell, not `bash` on `PATH`.
- Session hook stays Node (`hooks/session-start.mjs`), no `jq`.
- `.gitattributes` forces LF; a CRLF shebang fails silently on Windows.
