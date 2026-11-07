# Step 7

Fresh eyes and the end of a find-cause run.

- Run `node "${CLAUDE_SKILL_DIR}/../../lib/size-facts.mjs"`; when it prints `changed files` above 2 or `dependency-added yes`, or the fix crosses a public signature, persisted format or security boundary, run `code-review` at `node "${CLAUDE_SKILL_DIR}/../gate/scripts/pick-reviewer.mjs" --effort`'s level (`skip`, `low` or `medium`) and fix under Step 5. End on `node "${CLAUDE_SKILL_DIR}/../route-skills/scripts/next-stage.mjs" --after find-cause --artifact none`'s output when edits to build remain, else on `ship`.
