# Fresh-eyes critique

Judge the delivered diff against the request before judging its internal elegance. The enemy is author anchoring: the diff matches the reasoning that produced it while drifting from the request. The overcorrection is context-free review that rejects settled decisions or invents new scope.

## What it checks, in order

1. **Request match.** Read request or brief Goal before the diff. Name each requested outcome with no matching changed behavior.
2. **Scope.** Trace each changed path to one requested outcome. Path with no trace → scope creep.
3. **Claimed proof.** Match each Acceptance claim to a command or action executed this session.
4. **Missing verification.** Logic changed, repo has a test runner, no test ran → name the gap.
5. **Boundary inputs.** Check only these:
   - changed interface accepts a collection or optional value → empty input;
   - documented maximum size exists → that size;
   - shared mutable state changed → concurrent access;
   - authentication, validation, network, file, or process boundary changed → malformed or hostile input.
6. **Simplification.**
   - Name duplicated logic, an abstraction with one caller, or a form with fewer statements and same observable behavior.
   - Name as a cut any fallback chain, second source of truth, cache or replica, queue, polling loop, scheduler, watchdog, or distributed coordination the request did not ask for: each guards against an enemy the request never named.
   - Never name as a cut a security check, data-loss guard, accessibility affordance, idempotency, retry at an external boundary, or audit record: a simplification pass erodes these first.
7. **Boundary discipline.** Validation, error narrowing, and untrusted-input handling belong at the entry point; internal functions trust the shape they receive. Name such a check buried in business logic instead of at the boundary it protects.
8. **Domain modeling.** Scattered conditional chain or a second boolean synced with a first → often a state machine, typed model, or discriminated union in disguise. Name the chain or synced boolean and the state it stands in for.
9. **Late-reference evidence.** Security, data-migration, or test-design guidance loaded → match each claimed result to its recorded negative test, migration invariant, or failing-before/passing-after command. Do not reload or restate those procedures here.

Report correctness and security first, then scope, missing verification, simplification. Axis with no finding → say nothing.

## Getting a separate context

Use a perspective that has not seen the implementation reasoning. Give it exactly the request or brief and the diff, not the author's explanation of each choice.

## When no separate context exists

State that no separate context was available. Run the seven checks in order, re-reading the request before the diff. Do not claim a separate review occurred.

## Judgment

- Request and settled brief decisions outrank reviewer preferences.
- Observable behavior and executed proof outrank the author's explanation.
- Repository conventions outrank generic simplification advice, unless they conflict with the request.
