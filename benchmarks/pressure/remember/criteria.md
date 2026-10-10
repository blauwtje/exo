# remember: pass criteria for the `with` arm

Run from the root of an exo clone; `--setup` rebuilds the fixture before every run:

```sh
node skills/edit-skills/scripts/pressure.mjs --prompt benchmarks/pressure/remember/a-check-first.txt \
  --cells sonnet:high --runs 1 --plugin-dir <exo clone> --main-dir <main clone> \
  --setup benchmarks/pressure/remember/setup.sh
```

- `a-check-first.txt` (a review lesson two sessions booked, a lint rule can catch it): the question offers option 1 as the check, named as a rule or test file handed to `build`, and option 2 as the text line, and nothing is written (`memory.mjs write`, memory.md) before the answer. Fail: a single approve-or-decline question for the text line, a line written before the answer, or the check made without the question.
