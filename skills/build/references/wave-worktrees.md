# Wave worktrees

Each task of a wave, as `build` step 4 forms it, builds in its own worktree, so no build overwrites another's edit. The run creates, lands and removes every wave worktree; a delegate makes or leaves none. Defects: removing a worktree whose work no commit or saved diff keeps, or leaving one.

1. **Create.**
   - Record `git rev-parse HEAD` as `<base>`.
   - Per task run `git worktree add --detach "<root>-task-<n>" HEAD && mkdir "<root>-task-<n>/.exo"` (the build writes its report there, makes no folder), then the plan's `Worktree setup:` command inside it unless that reads `none`.
   - `<root>` = what `git rev-parse --show-toplevel` prints.
   - Never dispatch a build with the dispatch tool's worktree isolation: an isolated delegate reads nothing outside its worktree, so its brief and report would ride in the run's context.
   - Failed `git worktree add` or setup command → discard the wave before any dispatch; the task builds alone in the run's checkout; no wave forms.
   - Before builds go out, record `git -C <root> status --porcelain` as this wave's baseline: a build can still write into the run's checkout.
2. **Brief.**
   - Each dispatch names its folder as checkout and its `.exo/` as report directory; a delegate writes only there.
   - The brief `next-task.mjs` wrote sits under the run's `.exo/`; each dispatch names its path unchanged.
3. **Land.**
   - First run `git -C <root> status --porcelain` again and compare it with step 1's baseline.
   - New path → a build wrote into the run's checkout; `.exo/` never shows, excluded by `lib/scratch-exclude.mjs`.
   - New path outranks every green report: stop, show the listed paths, land nothing from this wave.
   - Then go to step 4, which removes it as a discarded wave, and end the turn naming those paths.
   - A failed sibling never discards a green task: for each green task in plan order run `node "${CLAUDE_SKILL_DIR}/scripts/land-task.mjs" --plan <plan> --task <n> --root "<root>-task-<n>"`.
   - Then on the run branch `git cherry-pick <sha>`, the sha `git -C "<root>-task-<n>" rev-parse HEAD` prints.
   - Failed task or land-task refusal → route as a failed build.
   - Cherry-pick conflict → `git cherry-pick --abort`, no manual resolve: a resolved conflict is a commit no task branch holds.
   - Landed tasks stay; after step 4 the turn ends naming the conflicting task.
4. **Remove.**
   - For each folder the run made, first save its diff: `git -C "<root>-task-<n>" add -A && git -C "<root>-task-<n>" diff --cached <base> > "<root>-task-<n>/.exo/task-<n>.patch"`.
   - Folder differing from `<base>` → the patch counts as written only once `test -s` finds it non-empty.
   - First wait with `wait-report.mjs --any` (six runs) for every running build of the wave.
   - Run `node "${CLAUDE_SKILL_DIR}/scripts/remove-worktree.mjs" --worktree "<root>-task-<n>" --run <root> --report "<root>-task-<n>/.exo/implementer-<n>.md"`, the report a build writes last.
   - It copies the folder's `.exo/` into the run's `.exo/`, and `docs/specs/` files git does not track into `.exo/kept/`, then removes the folder; it refuses, removing nothing, while the report or a copy is missing.
   - A dirty folder whose task did not land adds `--patch "<root>-task-<n>/.exo/task-<n>.patch"` only once it is written; `--force` is refused.
   - A folder whose diff is unsaved, or that it refused, is never removed: it stays, and the return names it.
   - A saved diff outranks a clean `git worktree list`: a worktree leaves only once its work is on the branch or in `.exo/`.
   - Otherwise no turn ends, stops or asks while `git worktree list` still prints a wave worktree this run made, other than a refused folder.
