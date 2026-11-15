# Code rules

Read this before you write code. These rules need judgment; the project's own lint and formatter decide style, so follow what they report.

## Design

- Name the data structure first, what holds the result and which module owns it, because the logic follows from the shape and a wrong shape costs every later line.
- Let types and data rule out an invalid state, because a state that cannot be built needs no check.
- Prefer a concrete shape: one state value over several booleans that must agree, a lookup table over a chain of branches.
- Give each format, decision and piece of state one owning module that the others call, because a second copy drifts.
- Compute in pure functions and keep I/O at the edges, so the logic can be tested without setup.
- An operation may run twice or stop halfway, so make it safe to repeat: a second run finds what the first one did and ends in the same state.

## Change

- Delete before you add, because every line is one more to read and keep.
- Before you remove or change behaviour you do not understand, read its callers and its history, because it may cover a case you cannot see.
- When you replace an API, move every caller and delete the old one in the same change, because two ways to do one thing drift apart.
- Add no wrapper with one caller and no function that only forwards a call, because a layer that hides nothing costs the reader a jump.
- Extract on the third copy, or sooner when the copies encode the same rule; two similar shapes are not yet one idea.
- Add no cache or compatibility path the task does not ask for, and speed up only a path you measured.
- Write no comment; put the reason in a name, a test or the commit message. The one exception is a reason an outside library, platform or protocol forces.

## Input and errors

- Validate untrusted input once, where it enters, and trust it inside, because repeated checks hide where the boundary is.
- Catch an error only where you can recover or add context, because a swallowed error turns a crash into a wrong answer.
- Report a failure the way the project does. Where the language throws, a function returns its result or throws, with no `null` or `false` meaning "failed"; the message names the operation and the offending value.
- Add a guard only for a state that can legitimately occur; a state that should never occur is a bug in what produces it, so fix it there.

## Tests

- Take a test's expected value from the requirement, not from running the code, because a value copied from the output only records what the code does today.
- A test asserts what a caller can observe. Try two edits: break the behaviour and the test fails; rewrite the internals and it still passes.
- Report a test you believe is wrong instead of changing it.

## Before the report

Read your own diff once and remove:

- comments that narrate what the code does
- guards for states that cannot happen
- compatibility paths nobody asked for
- edits unrelated to the task
