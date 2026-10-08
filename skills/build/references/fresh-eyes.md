# No spec, step 7: fresh eyes

Read this from no-spec step 7.

7. **Fresh eyes.**
   - Caller says a PR review follows, or `node "${CLAUDE_SKILL_DIR}/../../lib/size-facts.mjs"` ends with `small` → skip.
   - Else dispatch a `general-purpose` delegate on the session's model from `../reviewer-prompt.md` with request, repository root, `<skill>` (`${CLAUDE_SKILL_DIR}` resolved) and effort.
   - Effort: `low` up to five changed files or 200 changed lines, else `medium`.
   - `BLOCKED` → report it, review stays open.
   - `FINDINGS` → read only batch-review.md and, per `fix` finding, only its `file:start-end` range.
   - Fix each `fix` finding under step 5's proof; append `fixed` or `reported: <reason>`.
   - No delegate → run `code-review`, and report that no separate context was available.
