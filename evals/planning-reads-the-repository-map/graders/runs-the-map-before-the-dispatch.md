---
type: regex
pattern: 'repo-map\.mjs[\s\S]*exo:explorer'
match: contains
---

Passes when the generator is run before the explorer is dispatched: the transcript names `repo-map.mjs` and only afterwards names the agent.
