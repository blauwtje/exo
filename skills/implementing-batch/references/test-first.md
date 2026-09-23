# Test first

Hold the test-first route to one failing test before each production edit. The enemy is the excuse that makes the red run look optional. The overcorrection is a suite written ahead of the code, where every test past the first is a guess.

## The cycle

1. **Name the observable boundaries.** For each behavior, write the proof sentence `## Define the proof` in the test-design reference gives; a boundary nobody wrote down is one the tests couple to by accident.
2. **Get them confirmed** in the question shape, and wait, because a suite built on the wrong boundary is rewritten rather than repaired. A boundary the request names as an input with its expected output is already confirmed.
3. **One behavior per cycle**, through every layer it touches, because a layer alone has no passing state to stop at.
4. **Red, then green.** Run the new test and quote its failing output before the production edit, then quote the passing output after it, in the order `## Red before green` in the test-design reference sets.
5. **Least code.** Write only what turns that test green; code no test asked for waits for the test that asks.
6. **Restructure after the last cycle**, because a rewrite inside a cycle hides which behavior broke.
7. **Report the cycles**: each behavior, its test and both outputs, then each boundary still unobserved.

## Red flags

| The excuse | What holds |
|---|---|
| "The boundaries are obvious from the code." | Then they cost one line each to write down, and the one obvious to nobody else is the one that is wrong. |
| "Write the tests for the whole feature first." | Every test past the first is written against code that does not exist, so the first green is a whole implementation. |
| "It passes already, so the behavior is there." | A test that never failed proves only that it runs. |
| "Clean it up while it is green." | The restructuring and the next behavior then fail together, and the cycle no longer names which one broke. |
| "Two files is below the loop, so the test can come after." | The route runs at any file count, because the red run is the proof the request asked for. |

## Judgment

- A confirmed boundary outranks a boundary that reads well in the code.
- One failing test outranks a suite written ahead of the code.
- The test-design reference outranks this route wherever both speak, because it is the one copy of those rules.
