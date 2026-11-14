# Code standard

Applies to written or changed code, not instruction files; covers how code reads.

1. **Pass tests honestly**: fix the code; do not delete, skip or loosen an assertion or special-case a test input; report a test you believe is wrong.
2. **Chesterton's Fence**: before deleting or materially changing non-obvious behavior, check call sites and history.
3. **No comments** except a license header, a public API doc comment, an issue or RFC link, or a `why:` comment (`// why: ...`) marking behavior an external library, platform or protocol forces. Delete commented-out code; history goes in the commit, a "do not remove" note becomes a test, type or lint rule.
4. **No suppressions**: no `eslint-disable`, `@ts-ignore`, `noqa` or alike, except `prettier-ignore`, `max-len`/`E501` or an `@stylistic/` rule.
5. **Flat flow**: handle the exit case first with an early return, put no `else` after an exit, use a guard or a named function in place of a nested ternary, and nest control flow at most 2 levels per function.
6. **One idea per line**: name a sub-expression when a line needs explaining; a short guard `if (x) return y;` and a plain method chain are fine.
7. **Explicit coercion (JS/TS)**: convert with `Number(x)`, `Boolean(x)`, `String(x)`, not `!!x`, `+x` or `'' + x`; compare with `===` and `!==`.
8. **One responsibility**: one reason to change and one abstraction level per function; past 20 lines the check warns, so split only along a real responsibility.
9. **Parameters**: at most 3. Past that the function does too much or the values form one concept: split it, or pass that concept as one named type.
10. **Names**: say what the value means in the domain, longer for wider scope. A short or generic name (`x`, `result`) fits a scope of a few lines; name no module or exported symbol `data`, `info`, `helper`, `manager` or `utils`.
11. **Extract on the third copy**, or sooner when copies encode the same rule, not just the same shape.
12. **Boundaries**: validate untrusted input once where it enters and trust it inside; catch an error only where you can recover or add context, else let it propagate; do not swallow it.
13. **Errors**: a function returns its result or throws, with no `null`, `''` or `false` meaning "failed"; a message names the operation and the offending value.
14. **One owner**: one module owns each format, protocol, decision and piece of state; others call it, and none re-derives or caches a copy.
15. **Deep modules**: a small interface over much hidden work; no function, class or interface that only forwards a call; dependencies point one way, with no import cycle, layer skip or mutable global.
16. **Conventions**: match the file's naming, layout and idioms, and its handling of errors, cancellation, concurrency and resource lifetimes; repo conventions win over this standard except for the rules under Enforced.
17. **Types rule out invalid states**: types and data structures make an invalid state unrepresentable, not checked for.
18. **Functional core**: compute in pure functions and keep I/O at the edges; change a caller's object only when the function name says so.
19. **No flag arguments**: when callers pass a literal `true` or `false` to pick one of two code paths, write two named functions.
20. **Measured speed**: optimize only a measured hot path; add no cache, memo or batching without a number.
21. **Locality**: keep code next to its only user and declare a variable at first use.
22. **Enforced**: the land check fails on depth, parameters, nested ternary, else after return, `==`, implicit coercion, empty block, unused variable, swallowed catch, `=` and comma spacing, comments and suppressions; it warns on length over 20 lines, parameter reassignment or mutation, and `let` never reassigned.
