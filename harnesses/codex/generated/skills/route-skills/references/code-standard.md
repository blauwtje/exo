# Code standard

Applies to written or changed code, not instruction files. Covers how code reads, not what to build.

1. **Never weaken a test to pass**: no deleting, skipping or loosening assertions. Fix the code or report the failure.
2. **Chesterton's Fence**: before deleting or materially changing non-obvious behavior, check call sites and history where likely to explain it.
3. **No forwarding abstractions**: no function, class or interface that only forwards to one caller without adding a boundary.
4. **Failures**: handle at the right boundary; never swallow.
5. **Dead code**: remove only dead code, imports and variables your change orphaned; report other dead code.
6. **Extract on the third copy**, or sooner when copies encode the same rule, not just the same shape.
7. **Complexity**: function over ~50 lines or 4 nesting levels → split when a responsibility boundary exists.
8. **Architecture boundaries**: behavior in the owning layer; dependencies toward established contracts.
9. **No shortcuts**: no cycles, cross-layer shortcuts, duplicate sources of truth, mutable global state.
10. **Names**: domain names, not `data`, `result`, `helper`, `manager`; single-letter name only as loop index or receiver in a scope under 10 lines.
11. **Explicit flow**: explicit data and control flow; cohesive units over clever compression, boolean mode flags and hidden side effects.
12. **Comments**: state the code as it is (constraint, invariant, needed reason); change history goes in the commit.
13. **Conventions**: follow conventions for errors, cancellation, concurrency, resource lifetimes.
14. **No inner guards**: no guard, fallback or try/catch for a state the code's own boundary already rules out; validate once at the trust boundary.
15. **Types rule out invalid states**: types and data structures make an invalid state unrepresentable, not checked for.
