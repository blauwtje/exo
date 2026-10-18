# Handing off

Question script: `node "${CLAUDE_SKILL_DIR}/../route-skills/scripts/next-stage.mjs" --after spec --artifact <brief path or #<n>>`; with `--fresh` it prints the lines for a fresh chat.

First match wins:

- Invoked by another stage or a workflow → ask nothing, return to the caller.
- Brief in an issue → ask nothing; print the question script's `--fresh` output.
- Plan mode → the plan approval is the pick; after it, start the run per the Start line, no question.
- Otherwise → end the message on the question script's output; start nothing before the reply.

On the reply:

- Start now or `ok`, setting `env` is `ask` and the main checkout holds gitignored .env files → first ask once: copy them into each run worktree, or never. Store the answer with `node "${CLAUDE_SKILL_DIR}/../configure/scripts/settings.mjs" set env <copy or never> --scope project`.
- Start now or `ok` → invoke `exo:build` with the brief path in this session.
- Later → print the `--fresh` output; build nothing.
