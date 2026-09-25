# Pressure cases

Each folder holds the pressure cases of one skill: the case prompts, a `criteria.md` with the pass criterion for the `with` arm, and a `setup.sh` that lays down the fixtures under `/tmp/exo-pressure/<skill>/`. `technical-writing` needs no fixture, so it has no `setup.sh`.

To rerun a case, run the skill's setup, then run the prompt from the root of an exo clone:

```sh
bash benchmarks/pressure/blast-radius/setup.sh
node skills/skills-tool/scripts/pressure.mjs --prompt benchmarks/pressure/blast-radius/a-events.txt \
  --cells opus:high,sonnet:high --plugin-dir <exo clone>
```

`setup.sh` deletes and rebuilds only `/tmp/exo-pressure/<skill>/`, so rerunning it restores a clean fixture. The refactoring setup places the fixture scripts that each refactoring prompt tells the model to run in its empty directory. Add `--runs 3` to run each cell three times.
