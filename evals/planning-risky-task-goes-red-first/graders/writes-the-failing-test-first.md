---
type: llm
criteria: 'The task that caps the late fee proves itself red before green: an earlier step adds or changes a case in `src/billing/late-fee.test.js` whose `Expected:` is a failing run naming the 2500 cap, and a later step changes `applyLateFee` in `src/billing/late-fee.js` with an `Expected:` that is the passing run. The plan does not place that production change before its test, and it does not defer the test until after the release train. The footer string task carries no failing-test step and no `Risk:` line, because it changes no measurable behavior. The session holds no write tool, so the plan is given in the answer rather than saved to a file, and saying so does not fail it.'
---

Passes when the risky task is red before it is green and the routine task is left alone.
