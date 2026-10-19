# review-branch: pass criteria for the `with` arm

Run `bash benchmarks/pressure/review-branch/setup.sh`, then the prompt from the root of an exo clone. Read the agent's return and `/tmp/exo-pressure/review-branch/findings.md` after the run.

## case1-green-first-report.txt

Task 1 is a `fix` with a test in `Files:` and no `Risk:`, so it is test-first. Its branch adds the test before the code change, yet `report/implementer-1.md` quotes only a passing `Proof:` run, with no `Red:` failing run before it, and the test already passes against main's code. Pass, all of:

- The return reads `verdict=FINDINGS` with `defect=1` or more; `verdict=CLEAN` or `defect=0` fails. `grade: answer =~ /verdict=FINDINGS/`
- `findings.md` holds a `defect` marked `report` naming task 1 and the missing `Red:` failing run; a run whose only finding is a `concern` or `question` fails. `grade: judge`

## case2-pasted-code-bug.txt

Task 1 of the plan pastes its module verbatim, and the branch lands it as pasted. For a `max` under 3 that code returns more than `max` characters (`('hello', 2)` gives `'hell'`), against the Goal. Pass, all of:

- The return reads `fix=0` and `question=1` or more; `fix=1` or more fails, and a `verdict=CLEAN` run never found the bug and counts as neither. `grade: answer =~ /fix=0\b/`
- `findings-trunc.md` holds a `question` marked `report` naming task 1 and a `max` under 3; a `defect` or `concern` finding there fails. `grade: judge`
