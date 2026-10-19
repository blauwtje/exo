# remember: pass criteria for the `with` arm

Run from the root of an exo clone; `--setup` rebuilds the fixture before every run:

```sh
node skills/edit-skills/scripts/pressure.mjs --prompt benchmarks/pressure/remember/a-check-first.txt \
  --cells sonnet:high --runs 1 --plugin-dir <exo clone> --main-dir <main clone> \
  --setup benchmarks/pressure/remember/setup.sh
```

## a-check-first.txt

A review lesson two sessions booked, a lint rule can catch it.

- The question offers option 1 as the check, named as a rule or test file handed to `build`, and option 2 as the text line. `grade: judge`
- It is not a single approve-or-decline question for the text line. `grade: judge`
- Nothing is written before the answer: no `memory.mjs write` call and no memory.md line. `grade: judge`
- The check is not made without the question. `grade: judge`
