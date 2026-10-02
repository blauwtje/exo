# Code standard

Applies to written or changed code, not instruction files. This file: how the code reads, not what to build.

1. **Chesterton's Fence**: before deleting or materially changing non-obvious behavior, check call sites and history where likely to explain it. Never delete on assumption.
2. **Complexity**: split a function over ~50 lines or 4 nesting levels when a responsibility boundary exists.
3. **No forwarding abstractions**: no function, class or interface that only forwards to one caller without adding a boundary.
4. **Architecture boundaries**: behavior in the owning layer, dependencies toward established contracts. No cycles, cross-layer shortcuts, duplicate sources of truth, mutable global state.
5. **Readability**:
   - Write explicit data and control flow.
   - Use domain names, not `data`, `result`, `helper`, `manager`.
   - Prefer cohesive units over clever compression, boolean mode flags and hidden side effects.
   - Use a single-letter name only as a loop index or receiver in a scope under 10 lines.
   - Comments state the code as it is (constraint, invariant, needed reason); change history goes in the commit.
6. **Complete behavior**:
   - Follow conventions for errors, cancellation, concurrency, resource lifetimes.
   - Handle failures at the right boundary; never swallow.
   - Remove only dead code, imports and variables your change orphaned; report other dead code.
7. **Extract on the third copy**, or sooner when copies encode the same rule, not just the same shape.
8. **Never weaken a test to pass**: no deleting, skipping or loosening assertions. Fix the code or report the failure.
