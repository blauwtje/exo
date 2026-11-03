Read this when a repair fixes a reviewer finding, a failed gate or a red `Proof:`.

# Fix the class

Repair the rule the code broke, not only the line the finding names, so the same mistake cannot return elsewhere.

1. Name the class from the finding's `Class:` line. If there is none, name the rule in one phrase.
2. Sweep the repo for every other instance with the finding's `Sweep:` search, then fix every hit.
3. When a sweep still prints the repaired code, rewrite it once, rerun once, then report `reported: sweep matches repair`.
4. Add the cheapest guard that fails on a new instance: a table test, a `code-rules` or `validate:static` rule, or a plan-check rule.
5. Run the guard red on the old code when that is cheap.
6. Put these lines beside `Proof:` in the repair commit body: `Sweep: <n> fixed` and `Guard: <file>` or `Guard: none (<reason>)`.

Use `Guard: none (<reason>)` only when the guard's runtime or false blocks cost more than the expected recurrence, and name that cost in the reason.
