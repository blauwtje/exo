# Pressure cases

Each folder holds the pressure cases of one skill: the case prompts, a `criteria.md` with the pass criterion for the `with` arm, and a `setup.sh` that lays down the fixtures under `/tmp/exo-pressure/<skill>/`. `write-docs` needs no fixture, so it has no `setup.sh`.

To rerun a case, run the skill's setup, then run the prompt from the root of an exo clone:

```sh
bash benchmarks/pressure/check-impact/setup.sh
node skills/edit-skills/scripts/pressure.mjs --prompt benchmarks/pressure/check-impact/a-events.txt \
  --cells opus:high,sonnet:high --plugin-dir <exo clone>
```

`setup.sh` deletes and rebuilds only `/tmp/exo-pressure/<skill>/`, so rerunning it restores a clean fixture. The refactor setup places the fixture scripts that each refactor prompt tells the model to run in its empty directory; the build setup does the same with `setup-strings.sh` for its spec case and one script per no-spec case, each logging its checkout path to `/tmp/exo-pressure/build/checkouts.log` for grading, and the find-cause setup with its three `setup-<fixture>.sh` scripts. Add `--runs 3` to run each cell three times.

A skill's cases run once on Sonnet by default, and only when that skill changes, never in the build or ship flow.

`drive.mjs` runs one spec case over several turns: it resumes the session and sends the case's scripted replies while the model asks questions, up to `maxTurns` turns (99 by default).
Run the spec setup first. Each run writes its transcript and one `turn<n>.jsonl` per turn to `/tmp/exo-pressure/runs/<case>-<model>-<with|without>[-<label>]/`. Add `--label <text>` to keep repeated runs of one case from overwriting each other, and `--plugin-dir <dir>` to load the `with` arm's plugin from another exo clone instead of the checkout `drive.mjs` lives in. Add `--main-dir <dir>` to make any other arm a `main` arm that loads that copy instead of no exo.

```sh
bash benchmarks/pressure/spec/setup.sh
node benchmarks/pressure/drive.mjs B opus with 6
node benchmarks/pressure/drive.mjs B opus with 6 --label run2 --plugin-dir .worktrees/v053
```
