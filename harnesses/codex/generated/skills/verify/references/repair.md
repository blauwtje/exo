# After the fixer returns

Step 3 of `verify`, after `exo-fix-review` returns.

1. Rerun step 1's `verify.mjs`; a `FAIL` or `STRAY` line ends the turn with its report, fixes uncommitted.
2. Run `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/skills/verify/scripts/run-probes.mjs" --report <findings path> --root <checkout>` (reruns each `fixed` finding's probe); a `FAIL probe` line ends the turn with its report, fixes uncommitted.
3. Dispatch `exo-review-branch` with no model override and the scope `fix diff`, step 2's other inputs, findings path `<checkout>/.exo/fix-review.md`.
4. `FINDINGS` or `BLOCKED` verdict → end the turn with its report, fixes uncommitted.
5. Run `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/skills/build/scripts/land-task.mjs" --fix "fix(<scope>): address the branch review" --plan <plan path> --root <checkout>` to commit every changed path.
