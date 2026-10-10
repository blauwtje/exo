# Performance debugging

Measure the experienced path before any hypothesis or optimization. The enemy is a plausible micro-optimization applied without a baseline. The overcorrection is collecting numbers without a decision rule.

Wrong output or timeout → main `find-cause` loop, unless speed is the only symptom.

## The loop

1. **Measure the reported path.** Read an existing log, profile or `.exo/` report on it before measuring anew. Repository benchmark or profiler exists → use it, else time the end-to-end region the complaint names; ad hoc timer → run the same input five times, record median plus spread (`maximum - minimum`).
2. **Locate the bottleneck.** Profile or timing breakdown. Follow the largest measured region on the reported path, not the code that looks most expensive.
3. **Change one mechanism.** Smallest edit targeting that region. No adjacent cleanup bundled.
4. **Repeat the measurement.** Same tool, input, warm/cold state, run count. Record new median and spread.
5. **Apply the decision rule.** Keep the change only when the median improves by more than the larger of the before and after spreads; else revert it before testing another candidate.
6. **Stop at two reverts.** Second reverted candidate → go to the report step; a third guess at the same region is intuition, not measurement.
7. **Report evidence.** Before/after medians, both spreads, measurement method, input, mechanism changed.

## Judgment

- End-to-end measurements on the reported path outrank faster micro-benchmarks elsewhere.
