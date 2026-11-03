# exo

This is the source of the Claude Code plugin `exo`. Layout is in `README.md`; commands and internals are in `CONTRIBUTING.md`.

## Workflow

The **lead** is the main session that talks to the user. The lead only orchestrates, and subagents do the edits.

- The main checkout stays on `main`. Every edit runs in a worktree, because exo loads in place from this checkout.
- At the start of a run, first squash and push any unpushed commits on `main` from an earlier session, as the session-push bullet below describes.
- Then run `git pull --ff-only` on `main`, and remove every worktree and branch merged into `main`, local and remote. Remove each worktree as the removal bullet below describes.
- Also run `git fetch --prune`, then delete each local branch whose upstream is gone. `git branch -vv` shows `: gone]` for those, and `git branch --merged` misses squash merges.
- The lead only orchestrates. This overrides the user rule "Other work → do it directly", because exo loads in place from the main checkout.
- Every edit, fix and failed-check repair goes to a worktree subagent, one concern each. Independent parts run in parallel, and a brief with two unrelated parts becomes two subagents.
- Outside a run, only the lead writes `CHANGELOG.md`, so subagent branches never conflict on it. Every plan here ends with a task that writes its `## Unreleased` line, so the line lands in the run's squash commit.
- The lead runs `exo:spec` itself and writes the brief itself. Code reading goes to `exo:locate-code`.
- Build with `exo:build <brief>` in the lead session, which lands each task through `exo:task-runner` subagents. To resume, run `exo:build <brief>` again, and it reads landed tasks from `Plan-task:` commits.
- Headless `exo run` starts only from the user's terminal, and it refuses inside Claude Code.
- A plan task lands only through that loop. The lead and subagents commit no plan task on the run branch.
- Plans here use `Land: local` and `Commit: <type(scope): subject>`. After `gate` passes, the lead squashes the run branch onto `main` as that commit, as the squash bullet below describes.
- `main` stays unpushed until the session push, and no pull request is opened.
- An `exo:improve` run starts from one plain request in the current session, with no `exo:spec` or `exo:build`. It runs in its own worktree on `improve/<tag>`, and the lead dispatches the worker subagents and runs `round.mjs`.
- At Stop, the lead squashes the kept commits as the squash bullet below describes, and writes the CHANGELOG line.
- When a run task blocks, its partial work goes to a hint file such as `.exo/carry/task<n>-partial.patch`, and the run tree is reset. The partial work is not a commit on the run branch.
- After that reset, the lead fixes the plan or fixes the cause in a worktree subagent, then reruns `exo:build`. Check the plan with `node skills/spec/scripts/plan-check.mjs --loop --run --plan <plan> --root <run worktree>`.
- A Gate or Success criterion repair on the run branch is a `fix(<scope>):` commit with no `Plan-task:` trailer. Otherwise the gate flags its files `UNPLANNED <file>`.
- The gate is one fresh subagent briefed with the skill and its inputs only. Its first brief line is `exo-kind: review`, and it runs no checks beyond the skill's.
- Handover between phases uses the brief and `.exo/` files.
- Non-run subagent work lands in one integration worktree under `.worktrees/`. Merge the subagent branches, fetch, and rebase onto `origin/main`, and after the rebase every line of the change stays under `## Unreleased`.
- Squash: run `node lib/check-cache.mjs --query "npm run check"` first. `pass` skips the check, and `miss` runs `npm run check` once with output to a log, of which you read back only `SUMMARY` and failing lines.
- Then squash the branch onto `main` as one Conventional Commit, with `git merge --squash <branch>` and then `git commit`. Copy every branch `Evidence:` and `Proof:` line into the commit body, and do not push or open a pull request.
- After the squash, remove every worktree and branch the change created, local and remote. Delete a branch with `git branch -D <name>`, in its own command.
- Session push happens at session end, or when the user asks to push. Run `git reset --soft origin/main`, then `git commit` one Conventional Commit.
- The session-push subject names the session's main change, and its type is the highest in the batch (`feat` over `fix` over the rest). The body has one line per squashed change subject plus every `Evidence:`, `Proof:` and `Drops:` line.
- Then push `main` directly, so GitHub gets one commit per session.
- Remove a worktree from the main checkout, one command per worktree: `node skills/build/scripts/remove-worktree.mjs --kept --worktree .worktrees/<name> --run .`. Plain `git worktree remove` deletes the excluded `.exo/` with exit 0, so do not use it.
- Run `remove-worktree.mjs` with its output not piped away and its exit not masked. When it refuses, leave that worktree and its branch in place, report 2-3 options to the user, and do not use `--force`.
- A subagent runs no `git stash`, because all worktrees share one stash list. Cleanup drops a stash made on a run branch once its content is on `main`, and every other stash stays untouched.
- Every shell wait loop, such as an `until` loop with a `sleep` inside, needs a deadline: a counter inside the loop that exits with an error after a set number of rounds. GNU `timeout` is not an option, because stock macOS lacks it.
- This workflow outranks the workspace question in `skills/build/references/workspace.md` and the pull-request route in `ship`, so ask nothing about where to commit.
- A report that changed exo tells the user that exo loads in place from this checkout, so a new session runs it. The action line says to run `/reload-plugins` only for the open session.

## Principles

- When a mistake recurs across runs or reviews, add a check to `npm run check` or a fix on its code path. Do not add a new hook or another prose line, because a hook adds overhead to every session.
- When a plan task mixes a no-behavior-change edit with a behavior change, split it into two tasks, structural first.
- When a subagent report claims a passing check or a code fact, read the proof output line and the cited file before accepting it.
- When a run log or unit return shows looping, unrequested functionality or weakened tests, send that agent one SendMessage correction first. If the next return still drifts, stop the run, repair the cause, then resume.
- Add a new skill, agent or run stage only after a recorded failure the existing parts cannot fix.
- A subagent commit has one purpose and is made only after its proof passes. A command result in the commit body is a `Proof: <command> → <result>` line, not `Evidence:`.
- When a brief leaves a choice open, the subagent returns the competing readings to the lead instead of picking one silently.
- For a build speed or cost idea, first run `node benchmarks/speed-ledger.mjs --index`, which prints the index only.
- Pass the `benchmarks/speed-ledger.md` path to every idea agent's brief, and add each tested or rejected idea as a line in `benchmarks/speed-ledger.jsonl`. Then run `node benchmarks/speed-ledger.mjs --render`.

## Commands

- `npm run check` gates every commit, and a clean run ends `SUMMARY` with `FAIL=0 WARN=0 UNRUN=0`.
- The lead runs `npm run check` once, in the background, with output to a log. A delegate runs only its proof.
- Plan tasks here use `Land gate: npm run validate:static`, which runs the static checks and no test suite. `npm run check` runs once as the Success criterion.
- For a paid eval, run the quick tier first, and run the full tier only for an idea that passes it.
- `npm run check` flags a paid `benchmarks/*.mjs` entry point with no `--dry-run` and no quick default tier.

## Editing

- Before editing a skill, agent, rule, hook or `CLAUDE.md`, read `skills/edit-skills/references/instruction-style.md` and follow it. For an agent also read `agent-shape.md`, for a hook `hook-shape.md`, and for a skill script `script-shape.md`, all in the same folder.
- Before designing a prompt, context, agent, tool, harness or eval, read `docs/principles/README.md`, and open only the page it names.
- A bare skill name in a skill or prompt body means `exo:<name>`.
- Derive a new value from the repo, manifests or harness. Otherwise use one overridable default in run.json `defaults` (`lib/run-providers.json`, `~/.config/exo/run.json`) or an `EXO_*_MS` var via `environmentMs` (`lib/script-flags.mjs`), and hardcode only when that is needed and more useful.

## Release

- Each change adds one line under `## Unreleased` in `CHANGELOG.md`, in `### Added`, `### Changed`, `### Fixed` or `### Removed`. Raise no version.
- The weekly schedule in `.github/workflows/release.yml` cuts a release when `## Unreleased` holds an entry. When the user asks for one sooner, the lead runs `gh workflow run release.yml`, with optional `-f level=patch|minor|major`.
- A push to `main` releases nothing.
- Never run `npm run bump`, `git tag v<version>` or `gh release create` by hand, because a hand-cut version collides with the workflow's.
- A change the user should read first gets at most three bold lead sentences under `### Highlights` in `## Unreleased`, in the commit that records it and not in a release commit.
