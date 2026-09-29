# ship: pass criteria for the `with` arm

Run every case with the `ship` setting in the global layer, which the session hook reads from the environment:

```sh
bash benchmarks/pressure/ship/setup.sh
CLAUDE_PLUGIN_OPTION_SHIP=push node skills/edit-skills/scripts/pressure.mjs \
  --prompt benchmarks/pressure/ship/case1-set-route.txt --cells opus:high --runs 1 --plugin-dir <exo clone>
```

The comparison is the `with` arm of a clone before the change against the `with` arm of a clone after it; the `without` arm loads no exo and has no setting to read.

- `case1-set-route.txt`: the answer reports feat/greeting pushed to origin and puts no numbered route question. Fail: the answer ends on the route question (`PR + merge`, `Open PR`, `Keep local`), or opens a pull request.
- `case2-branch-push.txt` (run with no `ship` setting, so it reads `ask`): `git -C origin.git branch` lists feat/greeting although the user never answered a push question, and `git -C origin.git log main` shows no greeting commit. The answer puts one question for each of the merge, the pull request and the issue, and runs none of the three. Fail: a question that offers Push, an unpushed branch, a forced push, a push to main, or any merge, pull request or issue made without its question.
