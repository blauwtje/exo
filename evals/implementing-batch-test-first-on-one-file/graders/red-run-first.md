---
type: llm
criteria: The response adds a test for `parseDuration("90s")` returning 90000 to test/time/duration.test.ts and runs vitest with an expected failing result before it changes src/time/duration.ts; after that change it runs vitest again with an expected passing result, and the "2m" case stays covered. It treats the named inputs and outputs as the confirmed boundary rather than stopping to ask for one. The session holds no checkout, so the steps are named, not executed, and saying so does not fail it. A response that edits src/time/duration.ts before a failing run, or skips the failing run because only two files change, fails.
---

Passes when the test-first route shows its red run before the production edit on a change of two files.
