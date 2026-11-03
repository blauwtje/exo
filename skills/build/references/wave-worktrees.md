# Wave worktrees

Each task of a wave, as `build` step 4 forms it, builds in its own worktree, so no build overwrites another's edit. The run creates, lands and removes every wave worktree, and a delegate makes or leaves none. Two defects to avoid: removing a worktree whose work no commit or saved diff keeps, and leaving a worktree behind.

1. **Create.**
   - `--open-slots` runs this step; below is the hand-made wave.
   - Record `git rev-parse HEAD` as `<base>`, and take `<root>` from `git rev-parse --show-toplevel`.
   - Per task run `git worktree add --detach "<root>-task-<n>" HEAD && mkdir "<root>-task-<n>/.exo"`, because the build makes no folder. Then run the plan's `Worktree setup:` command inside it, unless that reads `none`.
   - Dispatch each build without the dispatch tool's worktree isolation: an isolated delegate reads nothing outside its worktree, so its brief and report would ride in the run's context.
   - When `git worktree add` or the setup command fails, discard the wave before any dispatch. The task then builds alone in the run's checkout and no wave forms.
   - Before builds go out, record `git -C <root> status --porcelain` as this wave's baseline, as a build can still write into the run's checkout.
2. **Brief.**
   - Each dispatch names its folder as checkout and its `.exo/` as report directory, and a delegate writes only there.
   - The brief `next-task.mjs` wrote sits under the run's `.exo/`, and each dispatch names its path unchanged.
3. **Land.**
   - First rerun `git -C <root> status --porcelain` and compare it with step 1's baseline.
   - A new path means a build wrote into the run's checkout. `.exo/` never shows, because `lib/scratch-exclude.mjs` excludes it.
   - A new path outranks every green report: stop, show the listed paths and land nothing from this wave.
   - Then go to step 4, which removes the wave as discarded, and return naming the paths.
   - A failed sibling does not discard a green task. For each green task in plan order run `node "${CLAUDE_SKILL_DIR}/scripts/land-task.mjs" --plan <plan> --task <n> --root "<root>-task-<n>"`.
   - Then on the run branch run `git cherry-pick <sha>`, with the sha that `git -C "<root>-task-<n>" rev-parse HEAD` prints.
   - A failed task or a land-task refusal routes as a failed build.
   - On a cherry-pick conflict run `git cherry-pick --abort` and resolve nothing by hand, because a resolved conflict is a commit no task branch holds.
   - Landed tasks stay. After step 4, return naming the conflicting task.
4. **Remove.**
   - First wait until every running build of the wave has reported back.
   - For each folder the run made, save its diff: `git -C "<root>-task-<n>" add -A && git -C "<root>-task-<n>" diff --cached <base> > "<root>-task-<n>/.exo/task-<n>.patch"`.
   - When the folder differs from `<base>`, the patch counts as written only once `test -s` finds it non-empty.
   - Run `node "${CLAUDE_SKILL_DIR}/scripts/remove-worktree.mjs" --worktree "<root>-task-<n>" --run <root> --report "<root>-task-<n>/.exo/implementer-<n>.md"`, where the report is the one a build writes last.
   - The script copies the folder's `.exo/` into the run's `.exo/`, and the `docs/specs/` files git does not track into `.exo/kept/`, then removes the folder. It refuses and removes nothing while the report or a copy is missing.
   - For a dirty folder whose task did not land, add `--patch "<root>-task-<n>/.exo/task-<n>.patch"` only once the patch is written. The script refuses `--force`.
   - A folder with an unsaved diff, or one the script refused, stays in place and the return names it.
   - A saved diff outranks a clean `git worktree list`: a worktree leaves only once its work is on the branch or in `.exo/`.
   - Return, stop or ask only when `git worktree list` prints no wave worktree this run made, apart from a refused folder.
