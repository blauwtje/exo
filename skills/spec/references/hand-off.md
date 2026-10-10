# Handing off

- Invoked by another stage or a workflow → ask nothing, return to the caller.
- Build here → load `exo:build` with `<brief path or #<n>> --land`.
- Build fresh → print the next-stage script's `--fresh` output.
