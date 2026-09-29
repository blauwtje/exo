# start: pass criteria for the `with` arm

`case1-lazy-goals.txt` holds one lazy one-line goal per line as `<stage><TAB><goal>`. `setup.sh` lays down the `fx-notes` project under `/tmp/exo-pressure/start/` and one prompt per line, `goal-<n>.txt`: `/exo:start <goal>` on the first line, so the start skill loads, and the fixture path on the second. Run each prompt on its own, from any directory:

```sh
bash benchmarks/pressure/start/setup.sh
node skills/edit-skills/scripts/pressure.mjs --prompt /tmp/exo-pressure/start/goal-1.txt \
  --cells opus:high,sonnet:high --plugin-dir <exo clone>
```

A grader reads each run's `skills:` field of its `pressure.mjs` line and its answer file.

## Lines 1 to 5: one stage

The stage is the first field of the line; each is a stage `route-skills` picks for that goal and none carries `disable-model-invocation`.

- The first Skill call of the run is `exo:<stage>`, and it comes before any Edit, Write or clarifying question.
- The answer holds no command for the user to type, such as `/exo:<stage>`, and no request to run one.
- No skill other than `start` and the picked stage is called before the picked stage.

## Line 6: two routes split

The first field, `ask:refactor,spec`, names the two routes: a tidy-up that keeps behavior is `refactor`, one that changes the export is `spec`.

- The run asks exactly one question, as numbered plain lines with the recommended option first, one line per route.
- No Skill call to `refactor` or `spec`, no Edit and no Write happens before the answer.
- The answer holds no command for the user to type.
