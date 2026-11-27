# Code principles

Every agent that writes code follows these, after BASE.md. The project's own lint and formatter decide style.

## Scope

- State your assumptions and the tradeoff before you build, and when the request is unclear, name what confuses you instead of guessing, because a wrong assumption runs unchecked through every later line.
- Trace every changed line to the request, because a line that does not trace is a review burden.
- Write the minimum that solves the problem: no option, abstraction or error path for a case nobody asked for, because each is code to keep and read. When 200 lines could be 50, rewrite them.
- Match the existing style and leave adjacent code alone; remove only what your own change orphaned, and report other dead code, because unrelated edits hide the real change.

## Design

- Name the data shape and its one owning module first, because the logic follows from the shape.
- Let a type or a lookup table rule out an invalid state, rather than add a check or a chain of branches.
- Prefer a deep module: a small interface over much work, and no wrapper that only forwards a call, because a layer that hides nothing costs a jump.
- Search the project before you add a helper or a name, and give one name one meaning, because a second copy drifts.
- Extract on the third copy, or sooner when copies encode one rule; give a caller that needs a flag its own function.
- Compute in pure functions, keep I/O at the edges, and make an operation safe to run twice.
- Replace an API by moving every caller and deleting the old one in the same change, and keep no backward-compatible path unless asked, because two ways to do one thing drift.
- Write the naive version that is surely correct first, and optimise only a path you measured, only while it stays correct.
- Refuse a change whose complexity costs more than it gains, and count a deleted line as a gain, because the reader pays for every line.

## Readability

- Put the reason in a name, a test or the commit message, and write no code comment unless an outside dependency forces one, because a comment goes stale.
- Use early returns and flat control flow; name on a `Noticed:` line each function past about 50 lines or 3 levels of nesting, and each file past about 300 lines.
- Write no em-dash in code, docs, commits or replies; use a comma, colon, period or parentheses, because it marks machine-written text.

## Errors

- Validate untrusted input once, where it enters, and trust it inside.
- Catch an error only where you can recover or add context; otherwise let it throw, with the operation and the offending value in the message, and never return `null` or `false` for failure.
- Guard only a state that can occur, and wrap no call in try/catch for an impossible case, because agents over-defend and the guards bloat the code; fix a state that should never occur where it is produced.
- Make an error message describe the failure state ("session not found"), not an expectation.

## Tests

- Write the test first from the success criterion, see it fail, then make it pass.
- Take the expected value from the requirement, not from running the code, because a copied output records only today's behaviour.
- Assert what a caller can observe: breaking the behaviour fails the test, rewriting the internals does not.
- Choose fixture values that a wrong implementation cannot satisfy by accident.

## Before the report

Read your own diff once and delete what the task does not need: narrating comments, guards for impossible states, compatibility paths, unrelated edits and scratch files.
