# Fresh-eyes critique

Judge the delivered diff against the request before judging its internal elegance. The enemy is author anchoring: the diff matches the reasoning that produced it while drifting from the request. The overcorrection is context-free review that rejects settled decisions or invents new scope.

## What it checks, in order

1. **Request match.** Read the request or brief Goal before the diff. Name any requested outcome with no corresponding changed behavior.
2. **Scope.** Trace every changed path to one requested outcome. A path with no trace is scope creep.
3. **Claimed proof.** Match every Acceptance claim to a command or action executed in this session.
4. **Missing verification.** When logic changed and the repo has a test runner, name the gap if no test ran.
5. **Boundary inputs.** Check empty input when the changed interface accepts a collection or optional value; maximum documented size when one exists; concurrent access when shared mutable state changed; malformed or hostile input when authentication, validation, network, file, or process boundaries changed. Do not invent an edge category outside those predicates.
6. **Simplification.** Name duplicated logic, an abstraction with one caller, or a form with fewer statements and the same observable behavior. Name as a cut any fallback chain, second source of truth, cache or replica, queue, polling loop, scheduler, watchdog, or distributed coordination the request did not ask for: each guards against an enemy the request never named. Never name as a cut a security check, a data-loss guard, an accessibility affordance, idempotency, a retry at an external boundary, or an audit record: these are the protections a simplification pass erodes first.
7. **Late-reference evidence.** When security, data-migration, or test-design guidance was loaded, match each claimed result to its recorded negative test, migration invariant, or failing-before/passing-after command. Do not reload or restate those procedures here.

Report correctness and security first, then scope, missing verification, and simplification. Say nothing for an axis with no finding.

## Getting a separate context

Use a perspective that has not seen the implementation reasoning. Give it exactly the request or brief and the diff. Do not include the author's explanation of each choice.

## When no separate context exists

State that no separate context was available. Then run the seven checks in order, re-reading the request before the diff. Do not claim a separate review occurred.

## Judgment

- The request and settled brief decisions outrank reviewer preferences.
- Observable behavior and executed proof outrank the author's explanation.
- Repository conventions outrank generic simplification advice unless they conflict with the request.
