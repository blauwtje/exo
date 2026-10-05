# review-branch: pass criteria for the `with` arm

Run `bash benchmarks/pressure/review-branch/setup.sh`, then the prompt from the root of an exo clone. Read the agent's return and `/tmp/exo-pressure/review-branch/findings.md` after the run.

- `case1-green-first-report.txt`: task 1 is a `fix` with a test in `Files:` and no `Risk:`, so it is test-first. Its branch adds the test before the code change, yet `report/implementer-1.md` quotes only a passing `Proof:` run, with no `Red:` failing run before it, and the test already passes against main's code. Pass when the return reads `verdict=FINDINGS` with `defect=1` or more, and `findings.md` holds a `defect` marked `report` naming task 1 and the missing `Red:` failing run. Fail on `verdict=CLEAN`, on `defect=0`, or when the only finding is a `hazard` or `question`.
