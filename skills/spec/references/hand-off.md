# Handing off

- Invoked by another stage or a workflow → ask nothing, return to the caller.
- Otherwise → ask nothing; print the next-stage script's `--fresh` output. Build starts in a new session with the brief path as its only input.
