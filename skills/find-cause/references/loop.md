# Steps 1-5

Detail for Steps 1-5 of the loop in SKILL.md, whoever runs them.

1. **Reproduce.**
   - No infrastructure: reproduce unstubbed at the first owning function below; no sign-off.
2. **Instrument.** Keep two hypotheses; observe once at their first divergence.
3. **Isolate.** Remove inputs or branches until one more clears it; two rounds standing end it.
4. **Predict, then fix.** State the causal line, changed output and why; change only that; drop old patches.
5. **Prove.** Re-run the repro, isolated case and suite per Step 1. Return to Step 1 when the repair reaches a second owner or resists one reading.
