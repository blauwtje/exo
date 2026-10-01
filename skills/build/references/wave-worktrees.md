# Wave worktrees

A wave, as `build` step 4 forms it, builds each of its tasks in a worktree of its own. The enemy is two delegates editing one checkout, where a build overwrites another's edit before either commits. The overcorrection is a worktree removed while holding work no commit or saved diff keeps, or one the run leaves behind. The run creates, lands and removes every wave worktree itself; a delegate never creates or leaves one.

1. **Create.**
   - Record `git rev-parse HEAD` as `<base>`.
   - For each task run `git worktree add --detach "<root>-task-<n>" HEAD && mkdir "<root>-task-<n>/.exo"`, then the plan's `Worktree setup:` command inside it unless that reads `none`.
   - `<root>` is what `git rev-parse --show-toplevel` prints, since the build writes its report there and never makes a folder.
   - Never dispatch a build with the dispatch tool's worktree isolation, because an isolated delegate reads nothing outside its worktree, so its brief and report would ride in the run's context.
   - A failed `git worktree add` or setup command discards the wave before any dispatch.
   - Then the current task builds alone in the run's checkout and the rest of the run forms no wave.
   - Before builds go out, record `git -C <root> status --porcelain` as this wave's baseline, because a build can still write into the run's checkout.
2. **Brief.**
   - Each dispatch names its folder as checkout and its `.exo/` as report directory, because a delegate writes only inside its worktree.
   - The brief `next-task.mjs` wrote sits under the run's `.exo/`, so each dispatch names its path unchanged.
3. **Land.**
   - First run `git -C <root> status --porcelain` again and compare it with step 1's baseline.
   - A new path means a build wrote into the run's checkout; `.exo/` never shows, excluded by `lib/scratch-exclude.mjs`.
   - A new path outranks every green report, even when every task passed its `Run:`: stop, show the listed paths, land nothing from this wave.
   - Then go to step 4, which force-removes it as a discarded wave, and end the turn naming those paths.
   - Otherwise a failed sibling never discards a green task: for each green task in plan order run `node "${CLAUDE_SKILL_DIR}/scripts/land-task.mjs" --plan <plan> --task <n> --root "<root>-task-<n>"`.
   - Then on the run branch `git cherry-pick <sha>`, the sha `git -C "<root>-task-<n>" rev-parse HEAD` prints.
   - A failed task, or a land-task refusal, routes as a failed build does once step 4 saves its diff.
   - A cherry-pick conflict undoes with `git cherry-pick --abort`, never a manual resolve in the run's checkout, because a resolved conflict there is a commit no task branch holds.
   - The tasks landed before a conflict stay, and after step 4 the turn ends naming the conflicting task.
4. **Remove.**
   - For each folder the run made, first save its diff: `git -C "<root>-task-<n>" add -A && git -C "<root>-task-<n>" diff --cached <base> > "<root>-task-<n>/.exo/task-<n>.patch"`.
   - For a folder differing from `<base>`, the patch counts as written only once `test -s` finds it non-empty.
   - Then run `node "${CLAUDE_SKILL_DIR}/scripts/remove-worktree.mjs" --worktree "<root>-task-<n>" --run <root>`, which copies its `.exo/`, patch and build report included, into the run's `.exo/` before removing it.
   - It refuses and removes nothing when any `.exo/` file stays uncopied.
   - A folder whose task did not land adds `--force`, and only after its patch is written.
   - Otherwise a folder whose diff is unsaved is never force-removed, stays, and the turn ends naming it.
   - A saved diff outranks a clean `git worktree list`: a worktree leaves only once its work is on the branch or in the run's `.exo/`.
   - No turn ends, stops or asks while `git worktree list` still prints a wave worktree this run made.
