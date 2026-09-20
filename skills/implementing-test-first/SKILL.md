---
name: implementing-test-first
description: "Use when a change to behavior will be written test-first: a bug with a reproduction, a rule with named inputs and outputs, or a request that says test-driven, red-green, or write the test first. Fires on the thought that the tests come after the code. Not for a change with no observable behavior, an unproven failure, which debug owns, or a whole plan, which implementing runs."
argument-hint: <the behavior to build test-first>
---

# Test first

Agree on what the tests observe before the first one exists, then build one behavior at a time, each proven red before it turns green. The enemy is the batch of tests written up front against boundaries nobody agreed on. The overcorrection is a cycle that restructures on every green and never reaches the second behavior.

## When to use

- A behavior with named inputs and outputs is about to be written, changed or fixed.
- The request says test-driven, red-green, or that the test comes first.
- Not for an unproven failure: `debug` owns it until the cause is named.
- Not for a plan already written: `implementing` runs one, and its tasks carry their own test steps.
- Not for a change with no observable behavior, such as a rename or a version bump.

## The loop

1. **Name the observable boundaries.** For each behavior, write the proof sentence that `## Define the proof` in the test-design reference gives; a boundary nobody wrote down is one the tests couple to by accident.
2. **Get them confirmed.** Put that list to the user in the shape `## A question` in `using-exo` gives and wait, because a suite built on the wrong boundary is rewritten rather than repaired.
3. **One behavior per cycle.** Take one behavior through every layer it touches, never one layer across several behaviors, because a layer alone has no passing state to stop at.
4. **Red, then green.** Run the cycle in the order `## Red before green` in that reference sets, quoting the failing output before the production edit and the passing output after it.
5. **Least code.** Write only what turns that test green; code no test asked for waits for the test that asks.
6. **Restructure after the last cycle.** Hold every restructuring until the last behavior is green, because a rewrite inside a cycle hides which behavior broke.
7. **Report the cycles.** Name each behavior, its test and both outputs, then each boundary still unobserved.

## Red flags

| The excuse | What holds |
|---|---|
| "The boundaries are obvious from the code." | Then they cost one line each to write down, and the one obvious to nobody else is the one that is wrong. |
| "Write the tests for the whole feature first." | Every test past the first is written against code that does not exist, so the first green is a whole implementation. |
| "It passes already, so the behavior is there." | A test that never failed proves only that it runs. |
| "Clean it up while it is green." | The restructuring and the next behavior then fail together, and the cycle no longer names which one broke. |

## References

| File | Read it when |
|---|---|
| `../implementing-batch/references/test-design.md` | Before step 1, for the proof sentence, the red-before-green order and what a test may assert. |

## Judgment

- A confirmed boundary outranks a boundary that reads well in the code.
- One failing test outranks a suite written ahead of the code.
- The test-design reference outranks this loop wherever both speak, because it is the one copy of those rules.
