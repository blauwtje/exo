# Handing off

- Invoked by another stage or a workflow → ask nothing, return to the caller.
- Otherwise, brief on disk → ask nothing; run `node "${CLAUDE_SKILL_DIR}/../build/scripts/exo-cli.mjs" run <brief path> --detach` and print its one line. The detached run builds the plan while this session ends.
- Brief in an issue, or the command refuses (lock held, error) → ask nothing; print the output of `node "${CLAUDE_SKILL_DIR}/../route-skills/scripts/next-stage.mjs" --after spec --artifact <brief path or #<n>> --fresh`. Build starts in a new session with the brief path as its only input.
