---
name: implementing-batch-test-first-on-one-file
runs: 5
max_turns: 10
timeout_seconds: 300
---

This is a real task, not a discussion; choose and act. This session holds no checkout and no write tool: your answer is the exact sequence you would run, not a request for the path. Load every skill you follow through the Skill tool before you answer, because naming a skill is not following it.

Repository `hookline`, a TypeScript CLI tested with `vitest`. `parseDuration("90s")` in `src/time/duration.ts` returns `NaN`; it must return `90000`, and `parseDuration("2m")` must keep returning `120000`. The test file is `test/time/duration.test.ts`. The working tree is clean on the branch `fix/duration-seconds`.

The user writes: "Write this test-first."

Name every file you change, the code you write and every command you run, in order, with the output you expect from each test run.
