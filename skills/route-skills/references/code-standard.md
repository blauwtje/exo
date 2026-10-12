# Code standard

Applies to written or changed code, not instruction files. Covers how code reads, not what to build.

1. **Never weaken a test to pass**: no deleting, skipping or loosening assertions. Fix the code or report the failure.
2. **Chesterton's Fence**: before deleting or materially changing non-obvious behavior, check call sites and history where likely to explain it.
3. **No comments**: add none except the allowed list; doubt means remove; change history goes in the commit.
4. **Allowed comments**: license header; behavior forced by an external library, platform or protocol, marked `why:` (`// why: ...`, `# why: ...`); doc comment of a public API; issue or RFC link.
5. **No commented-out code**: delete it. A "do not remove" or "let op" note becomes a test, type or lint rule.
6. **No suppressions**: no `eslint-disable`, `@ts-ignore`, `@ts-expect-error` or alike. Only a pure style rule may be suppressed.
7. **Guard clauses**: handle the exit case first with an early return; keep the main path flat.
8. **Nesting**: at most 2 levels of control flow per function.
9. **No else after exit**: no `else` after `return`, `break`, `continue` or `throw`.
10. **No nested ternaries**: use a guard clause or a named function.
11. **No compact one-liners**: one step per line; no chained clever expressions.
12. **Explicit coercion**: convert types by name (`Number(x)`, `Boolean(x)`); no implicit coercion through `!!`, unary `+` or `==`.
13. **One responsibility**: one reason to change and one abstraction level per function.
14. **Length**: function over 20 lines is a review signal, not a failure. Split only along a real responsibility, into a name that adds meaning.
15. **Parameters**: at most 3; more → one object.
16. **Names**: intent-revealing domain names; no `data`, `info`, `result`, `helper`, `manager`, `process`, `temp`, no arbitrary abbreviations; single-letter name only as loop index or receiver in a scope under 10 lines.
17. **No forwarding abstractions**: no function, class or interface that only forwards to one caller without adding a boundary.
18. **Extract on the third copy**, or sooner when copies encode the same rule, not just the same shape.
19. **Failures**: handle at the right boundary; never swallow.
20. **Dead code**: remove only dead code, imports and variables your change orphaned; report other dead code.
21. **Architecture boundaries**: behavior in the owning layer; dependencies toward established contracts.
22. **No shortcuts**: no cycles, cross-layer shortcuts, duplicate sources of truth, mutable global state.
23. **Conventions**: follow conventions for errors, cancellation, concurrency, resource lifetimes.
24. **No inner guards**: no guard, fallback or try/catch for a state the code's own boundary already rules out; validate once at the trust boundary.
25. **Types rule out invalid states**: types and data structures make an invalid state unrepresentable, not checked for.
