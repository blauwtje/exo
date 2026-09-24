# Answer shapes

The answer opens with the direct answer to the question asked, then gives the evidence in the shape of its mode. The enemy is a report about the search, or a list of files, where the asker wanted to understand. The overcorrection is a fixed template filled with empty sections; drop a section with nothing real in it.

## `how`

1. **Answer.** One or two sentences: what happens, end to end.
2. **How it works.** Prose that follows the chain from entry to effect, naming the concrete function, file and line at each hop: "`runNightlySync` (`src/sync/runner.js:8`) splits entries with `toBatches`", not "the runner delegates to a helper".
3. **Where the value comes from.** Config, environment and call-site overrides that change what the defaults suggest.
4. **Gotchas.** A name that misleads, a dead default, an override in one environment.
5. **Open questions.** What the reading did not reach, and the file or search that would settle it.

Prose, not pseudocode; a snippet only when one line carries the point. A diagram only when the chain has three or more parts.

## `why`

1. **Answer.** The verdict or reason in one sentence, with its tier.
2. **Found.** Verified facts, each with its commit, pull request, issue or file and line, quoting the message where it states the reason.
3. **Inferred.** Reasoning from those facts, each naming what it rests on.
4. **Unknown.** What stays open and what was searched.
5. **Sources.** One line per source: blame, log, pickaxe, `gh`, any MCP source, each with its result or "nothing found".
6. **For a pending change.** When the question precedes a change: what to preserve, what may change, and the risk the history names.

## `teach`

- Open with a plain definition in one sentence, the one thing to remember.
- Build one layer at a time: the mechanism first, then the reason, each in the asker's vocabulary.
- Keep the `why` tiers intact: a junior asker gets simpler words, never a firmer claim.
- A diagram for three or more moving parts grows one part per step, not one picture at the end.
- Name the concrete mechanism rather than a metaphor for it.
