# No spec, step 7: fresh eyes

Read this from no-spec step 7.

7. **Fresh eyes.**
   - Caller says a PR review follows, or `node "${CLAUDE_SKILL_DIR}/../../lib/size-facts.mjs"` ends with `small` → skip.
   - Else dispatch a `general-purpose` delegate with `model` omitted at `medium` effort from `../reviewer-prompt.md` with request, repository root, `<skill>` (`${CLAUDE_SKILL_DIR}` resolved).
   - `BLOCKED` → report it, review stays open.
   - `FINDINGS` → read only batch-review.md and, per `fix` finding, only its `file:start-end` range.
   - Fix each `fix` finding under step 5's proof; append `fixed` or `reported: <reason>`.
   - No delegate → run `code-review`, and report that no separate context was available.
