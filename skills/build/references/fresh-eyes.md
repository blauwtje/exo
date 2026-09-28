# No spec, step 7: fresh eyes

Read this from no-spec step 7.

7. **Fresh eyes.** Skip when the caller says a PR review follows, or when `node "${CLAUDE_SKILL_DIR}/../../lib/size-facts.mjs"` ends with `small`. Otherwise dispatch a `general-purpose` delegate on the session's model from `../reviewer-prompt.md` with request, repository root and effort (`low` up to five changed files or 200 changed lines, else `medium`). On `BLOCKED`, report it, leaving the review open. On `FINDINGS`, read only batch-review.md and, per `fix` finding, only its `file:start-end` range; fix it under step 5's proof and append `fixed` or `reported: <reason>`. Without a delegate, run `code-review`, and report that no separate context was available.
