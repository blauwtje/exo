# Code rules

Read this before you write code. These rules need judgment; the project's own lint and formatter decide style, so follow what they report.

## Design

- Name the data structure first, what holds the result and which module owns it, because the logic follows from the shape and a wrong shape costs every later line.
- Let types and data rule out an invalid state, because a state that cannot be built needs no check.
- Prefer a concrete shape: one state value over several booleans that must agree, a lookup table over a chain of branches.
- Give each format, decision, helper and piece of state one owning module that the others call, in its feature or, once two features use it, in shared code; search the project before you add a helper or a name, and give one name one meaning, because a second copy or meaning drifts.
- Compute in pure functions and keep I/O at the edges. Point imports one way, from a feature (the folder or package of one product part) to shared code and from I/O to the core, reach another feature only through its exports, and write imports the way the project already does, so each part can be tested and changed alone.
- An operation may run twice or stop halfway, so make it safe to repeat: a second run finds what the first one did and ends in the same state.

## Change

- Delete before you add, because every line is one more to read and keep.
- Before you remove or change behaviour you do not understand, read its callers and its history, because it may cover a case you cannot see.
- When you replace an API, move every caller and delete the old one in the same change, and update the project's codemap (an ARCHITECTURE file or layout section) when you add or move a folder, because two ways to do one thing, or a stale map, drift apart.
- Prefer deep modules, a small interface over much work: add no wrapper with one caller and no function that only forwards a call, because a layer that hides nothing costs the reader a jump.
- Extract on the third copy, or sooner when the copies encode the same rule; two similar shapes are not yet one idea. Shared code with a flag or branch per caller is the wrong abstraction: give your caller its own function instead of one more flag, and name the flagged code on a `Noticed:` line.
- Size is a smell: name on a `Noticed:` line each file or function your change takes past the project's lint limits, or, without them, a file past about 300 lines or a function past about 50 lines or 4 levels of nesting.
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
- Pick fixture values that a wrong implementation cannot satisfy by accident: non-zero, non-empty, one value reused where the code uses it twice.
- Report a test you believe is wrong instead of changing it.

## Before the report

Write scratch and repro files to the path that the `scratch-path.mjs` command from your agent or skill text prints when you pass it `<name>`, never in the checkout, because a file left in the checkout can land in the commit. Read `git status` and your own diff once, delete each file you created that the task does not need, and remove:

- comments that narrate what the code does
- guards for states that cannot happen
- compatibility paths nobody asked for
- edits unrelated to the task
