# Edit kinds

- Fix: add the symptom, where the code read puts it, and "fix the cause; do not silence the error, since a silenced error leaves the bug in place".
- Fix with a test command found: add "reproduce it with a failing test first, so the test proves the fix".
- Fix, or change or build whose success criterion runs tests: add "do not hard-code values that only make the tests pass; solve the problem in general, since tests verify correctness, not define the solution".
- The same kinds also get "if a test is wrong, say so rather than work around it, so the test itself gets fixed".
- Change or build: add "only make changes that are directly requested or clearly necessary, since each extra change is more to review". Name a pattern file found, and a runnable check from the repo's own test or build command.
- Rewrite with a check or success criterion: add "show evidence of success, such as the output of each check you ran, rather than asserting it; evidence is faster to review than a rerun".
- Visual ("better", "nicer"): add the user's visual words and any reference they gave, verbatim. Patterns and checks stay with `exo:design-ui`.
