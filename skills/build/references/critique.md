# Fresh-eyes critique

Judge the delivered diff against the request before its internal elegance. The enemy is author anchoring: the diff matches the reasoning that produced it while drifting from the request. The overcorrection is context-free review that rejects settled decisions or invents new scope.

## What it checks, in order

1. **Request match.** Read request or brief Goal before the diff. Name each requested outcome with no matching changed behavior.
2. **Scope.** Trace each changed path to one requested outcome. Path with no trace → scope creep.
3. **Claimed proof.** Match each Acceptance claim to a command or action executed this session.
4. **Missing verification.** Logic changed, repo has a test runner, no test ran → name the gap.
5. **Boundary inputs.** Check only these:
   - A changed interface that accepts a collection or optional value gets empty input.
   - A documented maximum size gets that size.
   - Changed shared mutable state gets concurrent access.
   - A changed authentication, validation, network, file, or process boundary gets malformed or hostile input.
6. **Simplification.**
   - Name a shared function that gained a flag or mode parameter for a second caller: inline it back and split.
   - Name duplicated logic, an abstraction with one caller, or a form with fewer statements and same observable behavior.
   - Name as a cut any fallback chain, second source of truth, cache or replica, queue, polling loop, scheduler, watchdog, or distributed coordination the request did not ask for.
   - Do not name as a cut a security check, data-loss guard, accessibility affordance, idempotency, retry at an external boundary, or audit record.
7. **Late-reference evidence.** Security, data-migration, or test-design guidance loaded → match each claimed result to its recorded negative test, migration invariant, or failing-before/passing-after command.

Report correctness and security first, then scope, missing verification, simplification. Axis with no finding → say nothing.

## Getting a separate context

Give a perspective that has not seen the implementation reasoning exactly the request or brief and the diff, not the author's explanation.

## When no separate context exists

State that no separate context was available. Run the seven checks in order, re-reading the request before the diff, and claim no separate review.

## Judgment

- Request and settled brief decisions outrank reviewer preferences.
- Observable behavior and executed proof outrank the author's explanation.
- Repository conventions outrank simplification advice, except a rule the land check enforces, unless they conflict with the request.
