---
type: llm
criteria: 'Investigation starts by running the shipped generator `repo-map.mjs` and reading the map file whose path it prints, and only then dispatches the `exo:explorer` agent, for the locations the map left open rather than for all three. The answer does not grep or list the 900 tracked files itself, does not open whole files, and does not dispatch the agent as its first act with the map skipped or deferred until afterwards. Treating the map as one file read by path, rather than as something injected at session start or committed to the repository, passes. The session holds no checkout, so the commands are named rather than executed, and saying so does not fail it.'
---

Passes when the map is built and read first and the dispatch asks only for what it left open.
