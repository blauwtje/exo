# After the fixer returns

Step 3 of `verify`, once the `exo-fix-review` agent has returned.

1. Rerun step 1's `verify.mjs`; a `FAIL` or `STRAY` line ends the turn with its report and the fixes uncommitted.
2. Run `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/skills/verify/scripts/run-probes.mjs" --report <findings path> --root <checkout>`, which reruns the probe of every finding marked `fixed`; a `FAIL probe` line ends the turn with its report and the fixes uncommitted.
3. Dispatch `exo-review-branch` with no model override and the scope `fix diff`, with step 2's other inputs but `<checkout>/.exo/fix-review.md` as the findings path.
4. A `FINDINGS` or `BLOCKED` verdict ends the turn with its report and the fixes uncommitted.
5. Run `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/skills/build/scripts/land-task.mjs" --fix "fix(<scope>): address the branch review" --plan <plan path> --root <checkout>` to commit every changed path.
