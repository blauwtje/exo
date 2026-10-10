# After the fixer returns

Step 3 of `verify`, after `exo:fix-review` returns. One branch review, one repair, one review of the fix diff, then land or report.

0. Fixer return with no `fixed=` line (turn cap) → count each finding it did not mark as `reported`; no resume, no redispatch; continue with step 1.
1. Rerun step 1's `verify.mjs`; a `FAIL` or `STRAY` line ends the turn with its report, fixes uncommitted.
2. Run `node "${CLAUDE_SKILL_DIR}/scripts/run-probes.mjs" --report <findings path> --root <checkout>` (reruns each `fixed` finding's probe); a `FAIL probe` line ends the turn with its report, fixes uncommitted.
3. Dispatch `exo:review-branch` with no model override and the scope `fix diff`, step 2's other inputs, findings path `<checkout>/.exo/fix-review.md`; no file there → the one resume in the `## Dispatch` rules that verify's step 2 names.
   - Still no file → end the turn `BLOCKED` with its report, fixes uncommitted, even when the return line reads `CLEAN`.
   - Run no `merge-reviews.mjs` on that file.
4. `FINDINGS` with `fix=0` (only `report` findings) → step 5. `FINDINGS` with `fix=1` or more, or `BLOCKED` → end the turn with its report, fixes uncommitted.
5. Run `node "${CLAUDE_SKILL_DIR}/../build/scripts/land-task.mjs" --fix "fix(<scope>): address the branch review" --plan <plan path> --root <checkout>` to commit every changed path.
