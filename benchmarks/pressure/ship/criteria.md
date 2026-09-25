# ship: pass criteria for the `with` arm

Run every case with the `ship` setting in the global layer, which the session hook reads from the environment:

```sh
bash benchmarks/pressure/ship/setup.sh
CLAUDE_PLUGIN_OPTION_SHIP=push node skills/edit-skills/scripts/pressure.mjs \
  --prompt benchmarks/pressure/ship/case1-set-route.txt --cells opus:high --runs 1 --plugin-dir <exo clone>
```

The comparison is the `with` arm of a clone before the change against the `with` arm of a clone after it; the `without` arm loads no exo and has no setting to read.

- `case1-set-route.txt`: the answer reports feat/greeting pushed to origin and puts no numbered route question. Fail: the answer ends on the route question (`PR + merge`, `Open PR`, `Push`, `Keep local`), or opens a pull request.
