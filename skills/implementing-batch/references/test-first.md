# Test first

Hold the test-first route to one failing test before each production edit. The enemy is the excuse that makes the red run look optional. The overcorrection is a suite written ahead of the code, where every test past the first is a guess.

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
