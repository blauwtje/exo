Read this when a repair fixes a reviewer finding, a failed gate or a red `Proof:`.

# Fix the class

Repair the rule the code broke at the hits the finding names, so the same mistake cannot return there.

1. Name the class from the finding's `Class:` line. If there is none, name the rule in one phrase.
2. Fix the hits the finding names; sweep no other hit unless a failing check proves it.
3. When the finding asks for a guard, add the cheapest one that fails on a new instance, and run it red on the old code; add at most one new test per cause.
4. Put this line beside `Proof:` in the repair commit body: `Guard: <file>` or `Guard: none (<reason>)`.

Use `Guard: none (<reason>)` only when the guard's runtime or false blocks cost more than the expected recurrence, and name that cost in the reason.
