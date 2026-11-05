# No spec, step 7: fresh eyes

Read this from no-spec step 7. A second reader in a separate context catches what the author misses.

7. **Fresh eyes.**
   - Skip this step when the caller says a PR review follows, or when `node "${CLAUDE_SKILL_DIR}/../../lib/size-facts.mjs"` ends with `small`.
   - Else dispatch a `general-purpose` delegate whose prompt opens with `exo-kind: peer-review` from `../reviewer-prompt.md` with `Reads:` and `Worktree: <abs path>` lines, request, repository root, `<skill>` (`${CLAUDE_SKILL_DIR}` resolved).
   - On `BLOCKED`, report it and leave the review open.
   - On `FINDINGS`, read only batch-review.md and, per `fix` finding, only its `file:start-end` range.
   - Fix each `fix` finding under step 5's proof, and append `fixed` or `reported: <reason>`.
   - When no delegate is available, run `code-review` and report that no separate context was available.
