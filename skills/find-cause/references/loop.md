# Steps 1-5

Detail for Steps 1-5 of the loop in SKILL.md, whoever runs them.

1. **Reproduce.**
   - No infrastructure: reproduce unstubbed at the first owning function below; do not ask the user first.
2. **Instrument.** Keep two hypotheses; observe once at their first divergence.
3. **Isolate.** Remove inputs or branches until one more clears it; two rounds standing end it. A `First bad` commit's hunks are the first inputs to remove.
4. **Predict, then fix.** State the causal line, changed output and why. Change only that, and drop old patches.
5. **Prove.** Re-run the repro, isolated case and suite per Step 1. Return to Step 1 when the repair reaches a second owner or resists one reading.

## Step 7

- Run `node "${CLAUDE_SKILL_DIR}/../../lib/size-facts.mjs"`; when the Step 7 trigger in SKILL.md holds, run `code-review` at level `low` and fix under Step 5. End on `node "${CLAUDE_PLUGIN_ROOT}/lib/next-stage.mjs" --after find-cause --artifact none`'s output when edits to build remain, else on `ship`.
