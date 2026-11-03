# Performance debugging

Measure the experienced path before any hypothesis or optimization. The enemy is a plausible micro-optimization applied without a baseline. The overcorrection is collecting numbers without a decision rule.

For wrong output or a timeout, use the main `find-cause` loop, unless speed is the only symptom.

## The loop

1. **Measure the reported path.** Read an existing log, profile or `.exo/` report on it before measuring anew.
   - If a repository benchmark or profiler exists, use it. Otherwise time the end-to-end region the complaint names.
   - With an ad hoc timer, run the same input five times and record the median plus spread (`maximum - minimum`).
2. **Locate the bottleneck.** Take a profile or timing breakdown. Follow the largest measured region on the reported path, not the code that looks most expensive.
3. **Change one mechanism.** Make the smallest edit targeting that region, and bundle no adjacent cleanup.
4. **Repeat the measurement.** Use the same tool, input, warm or cold state and run count. Record the new median and spread.
5. **Apply the decision rule.** Keep the change only when the median improves by more than the larger of the before and after spreads. Otherwise revert it before testing another candidate.
6. **Stop at two reverts.** After the second reverted candidate, go to the report step, because a third guess at the same region is intuition, not measurement.
7. **Report evidence.** Give the before and after medians, both spreads, the measurement method, the input and the mechanism changed.

## Judgment

- End-to-end measurements on the reported path outrank faster micro-benchmarks elsewhere.
