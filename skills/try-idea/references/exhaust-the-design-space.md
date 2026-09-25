# Exhaust the design space

Build competing variants before answering a question no precedent settles. The enemy is one build mistaken for proof when the open part was the shape itself. The overcorrection is polishing every variant before comparing any of them.

## When it applies

- The question names no precedent in this codebase or elsewhere, and one build would leave it open rather than settle it.
- Not for mechanical work, a bug fix or refactor with a clear target, or a question a constraint already answers with a single approach.

## The loop

1. **Name 2-3 structurally different shapes.** Each differs in types, module boundaries, or control flow; a variant of one shape, down to a renamed variable, is that shape again.
2. **Build the least each needs to be told apart.** Each variant follows step 4's throwaway rules and lands on the same `temp/<name>`, one commit per variant.
3. **Compare, then answer.** Read the question's observation off each variant before recording the decision at step 6.

## Judgment

- One written question and one throwaway branch still hold; only the build inside step 3 forks into variants.
- A variant that fails to compile or run still counts, once it shows enough of the shape to compare; finishing it to prove the failure does not.
