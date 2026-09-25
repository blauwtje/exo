# workspace: pass criteria for the `with` arm

Run every case with the `workspace` setting in the global layer, which the session hook reads from the environment:

```sh
bash benchmarks/pressure/workspace/setup.sh
CLAUDE_PLUGIN_OPTION_WORKSPACE=branch node skills/edit-skills/scripts/pressure.mjs \
  --prompt benchmarks/pressure/workspace/case1-set-place.txt --cells opus:high --runs 1 --plugin-dir <exo clone>
```

The comparison is the `with` arm of a clone before the change against the `with` arm of a clone after it; the `without` arm loads no exo and has no setting to read.

- `case1-set-place.txt`: the run commits the task on a new branch it names, not on main, and puts no numbered workspace question. Fail: the answer ends on the question (`Branch`, `Worktree`, `Current branch`), or commits on main.
