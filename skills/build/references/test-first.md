# Test first

Hold the test-first route to one failing test before each production edit. The enemy is the excuse that makes the red run look optional. The overcorrection is a suite written ahead of the code, where every test past the first is a guess.

## The cycle

1. **Name the observable boundaries.** Each behavior → write the proof sentence from the test-design reference's `## Define the proof`; a boundary nobody wrote down is one tests couple to by accident.
2. **Get them confirmed** in the question shape, and wait: a suite on the wrong boundary gets rewritten, not repaired. Boundary the request names as input with expected output → already confirmed.
3. **One behavior per cycle**, through every layer it touches; a layer alone has no passing state to stop at.
4. **Red, then green**, in the order the test-design reference's `## Red before green` sets. Red run needs infrastructure the repository lacks → report the closest executable check used instead.
5. **Least code.** Write only what turns that test green; code no test asked for waits for the test that asks.
6. **Restructure after the last cycle**; a rewrite inside a cycle hides which behavior broke.
7. **Report the cycles**: each behavior, its test, both outputs, then each boundary still unobserved.

## Red flags

| The excuse | What holds |
|---|---|
| "The boundaries are obvious from the code." | Then each costs one line to write down, and the one obvious to nobody else is the wrong one. |
| "Write the tests for the whole feature first." | Every test past the first targets code that does not exist, so the first green is a whole implementation. |
| "It passes already, so the behavior is there." | A test that never failed proves only that it runs. |
| "Clean it up while it is green." | Restructuring and the next behavior then fail together; the cycle no longer names which broke. |
| "Two files is below the loop, so the test can come after." | The route runs at any file count; the red run is the proof the request asked for. |

## Judgment

- Confirmed boundary outranks a boundary that reads well in the code.
- One failing test outranks a suite written ahead of the code.
- Test-design reference outranks this route wherever both speak; it owns those rules.
