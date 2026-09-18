---
name: implementing-verifies-before-the-review
runs: 5
max_turns: 6
---

This session holds no checkout and no write tool: your answer is the exact commands you run, in order, and the exact dispatches you send, not a request for the files.

You are mid-run on `docs/plans/invoice-export.md` in `/home/dev/billing`, on the branch `feat/invoice-export`, which the user picked at the start of this run. The plan has four tasks, none of them carrying a `Design:` line, and `git log --grep '^Plan-task: <n>$'` finds a commit for all four: `a1c9f30`, `77b2e14`, `0d5ae88` and `c4f1b09`. The plan's `## Final verification` reads:

```text
- `npm test` -> 214 passing, 0 failing
- `npm run build` -> built in under 30s, no error
- `npm run typecheck` -> no error
```

Every task's own build report came back green when it landed. The user has asked you nothing and is waiting for the run to finish.

Write what the run does from now on, given that `npm test` prints `214 passing, 0 failing`, `npm run build` prints `built in 9.4s`, and `npm run typecheck` prints `src/export/invoice-csv.ts(42,7): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.`
