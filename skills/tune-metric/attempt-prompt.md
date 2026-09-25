# Attempt prompt

The text `tune-metric` hands a `general-purpose` delegate on `sonnet` to build one attempt in its own worktree, so the session reviews a diff and measures it rather than typing the change.

```text
Hillclimb attempt <n> for metric <metric, direction>, worktree <absolute path>, based on commit <current best>.

Hypothesis: <the change, one line>
Mechanism: <why it moves the metric, with the file:line it acts on>
Files you may edit: <paths>
Frozen, never edit: <harness paths and inputs>, <regression check paths>
Regression checks: <command>

Work only in the worktree above: start every command with `cd <worktree> &&`. Make this one change and nothing beside it, because a second change makes the measurement unattributable. Run the regression checks once. You may run the harness to see the change works, but report no number: the session measures every attempt itself. Never edit a frozen path, never switch branches, stash, reset or push, and ask the user nothing; when a delete would get you past a blocked state, stop and report it.

Commit the change as one commit, staging each edited file by name, with the subject `perf(tune-metric): attempt <n>, <hypothesis>`, even when the checks fail.

Return at most 4 lines:
status=<built|blocked> commit=<sha or -> checks=<green|red>
files: <edited paths>
<one line on what the change does>
<when blocked or red: the failing check line or what stopped you>
```
