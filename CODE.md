# Code

**Write code the next reader understands in one pass.** Every line you add is a line someone has to read, keep and debug, so the better change is often the smaller one, and a deleted line counts as a gain. The project's own lint and formatter decide style; these rules decide the rest.

## Before you write

- Say your assumptions and the trade-off first. When the request is unclear, name what confuses you instead of guessing.
- Name the data shape and the one module that owns it. The logic follows from the shape.
- Search the project before you add a helper or a name. A second copy drifts from the first.

## Design

- Let a type or a lookup table rule out an invalid state, instead of a check or a chain of branches.
- Prefer a deep module: a small interface over a lot of work. A wrapper that only forwards a call hides nothing and costs the reader a jump.
- Extract on the third copy, or sooner when the copies encode one rule. Give a caller that needs a flag its own function.
- Compute in pure functions, keep input and output at the edges, and make an operation safe to run twice.
- Replace an API by moving every caller and deleting the old one in the same change, because two ways to do one thing drift apart.
- Write the plain version that is surely correct first, and optimise only a path you measured.

## Scope

- Trace every changed line to the request. Add no option, abstraction or error path for a case nobody asked for.
- Leave nearby code alone. Remove only what your own change left unused, and report other dead code on a `Noticed:` line.

## Readability

- Put the reason in a name, a test or the commit message. Write no comment unless an outside dependency forces one, because a comment goes stale while the code changes.
- Use early returns and flat control flow. Report on a `Noticed:` line each function past about 50 lines or 3 levels of nesting, and each file past about 300 lines.
- Write no em-dash in code, docs or commits; use a comma, a colon, a period or parentheses.

## Errors

- Check untrusted input once, where it enters, and trust it inside.
- Catch an error only where you can recover or add context. Otherwise let it throw, with the operation and the bad value in the message, and never return `null` or `false` to mean failure.
- Guard only a state that can happen. Fix a state that should never happen where it is produced.
- Word an error as the state you found ("session not found"), not as what you expected.

Bad:

```js
function findUser(id) {
  try {
    const user = users.get(id);
    if (!user) return null;
    return user;
  } catch {
    return null;
  }
}
```

Good:

```js
function findUser(id) {
  const user = users.get(id);
  if (!user) throw new Error(`user not found: ${id}`);
  return user;
}
```

The first catches an error that `Map.get` never throws, and turns "not found" into a `null` that every caller must remember to check.

## Tests

- Take the expected value from the requirement, never from running the code: a copied output only records today's behaviour.
- Assert what a caller can see, so breaking the behaviour fails the test and rewriting the inside does not.
- Pick fixture values that a wrong implementation cannot match by accident.

## Before you report

Read your own diff once and delete what the task does not need: comments that narrate, guards for impossible states, compatibility paths, unrelated edits and scratch files. When your diff is much longer than the problem needs, rewrite it shorter.
