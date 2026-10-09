# After the fixer returns

Step 3 of `verify`, after `exo:fix-review` returns.

1. Rerun step 1's `verify.mjs`; a `FAIL` or `STRAY` line ends the turn with its report, fixes uncommitted.
2. Run `node "${CLAUDE_SKILL_DIR}/scripts/run-probes.mjs" --report <findings path> --root <checkout>` (reruns each `fixed` finding's probe); a `FAIL probe` line ends the turn with its report, fixes uncommitted.
3. Dispatch `exo:review-branch` with no model override and the scope `fix diff`, step 2's other inputs, findings path `<checkout>/.exo/fix-review.md`.
4. `FINDINGS` with `fix=0` (only `report` findings) → step 5. `FINDINGS` with `fix=1` or more, or `BLOCKED` → end the turn with its report, fixes uncommitted.
5. Run `node "${CLAUDE_SKILL_DIR}/../build/scripts/land-task.mjs" --fix "fix(<scope>): address the branch review" --plan <plan path> --root <checkout>` to commit every changed path.
