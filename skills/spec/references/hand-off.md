# Handing off

Handing off ends the shaping turn by asking the user whether to start the build. The question script is `node "${CLAUDE_PLUGIN_ROOT}/lib/next-stage.mjs" --after spec --artifact <brief path or #<n>>`, which prints a start-or-change question, or the open-points list.

First match wins:

- When another stage or a workflow invoked spec, ask nothing and return to the caller.
- In plan mode the plan approval is the pick. After it, start the run and ask no question.
- Otherwise, end the message on the question script's output and start nothing before the reply.

On the reply:

- On `ok`, when setting `env` is `ask` and the main checkout holds gitignored .env files, first ask once whether to copy them into each run worktree or not. Store the answer with `node "${CLAUDE_SKILL_DIR}/../configure/scripts/settings.mjs" set env <copy or never> --scope project`.
- On `ok`, invoke `exo:build` with the brief path in this session.
- On a change request, edit the brief, check it, then ask again, and build nothing.
