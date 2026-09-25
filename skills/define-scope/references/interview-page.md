# The interview page

Show the interview on one page: every question of the round as a card, the earlier rounds with what was chosen, and the tree of decisions beside them, sent with one button. The enemy is the tab opened for a single question, which costs more than the digit it replaces. The overcorrection is a page that answers for the user when nothing is sent.

## When it runs

- `interview=page` stands in the session's `exo settings:` line, and the map holds two or more open decisions.
- Every other case asks in the conversation, in the layout `## A round` gives.

## The map file

Read the decision-map reference first: it owns the run folder, the full map format, and the `--add`/`--apply`/`--text` commands that write `map.json`. `--serve` and `--ask` below only read the file those commands produced; a decision moves through three states:

```json
{ "id": "format", "state": "closed", "closedBy": "you" },
{ "id": "range", "state": "open" },
{ "id": "layout", "state": "waits", "waitsOn": "range" }
```

- `closedBy` (`you`, `code` or `exo`) names who answered it; `code` carries `evidence`.
- An asked decision carries two to four `options`, exactly one of them `recommended`.

## The commands

```bash
node scripts/question-page.mjs --serve "$RUN/questions" --map "$RUN/map.json" 2> "$RUN/page.log"
node scripts/question-page.mjs --ask "$RUN/questions" --map "$RUN/map.json" > "$RUN/answer.json"
```

- Run both; never read the script. `--serve` runs once per interview under the Bash tool's `run_in_background`, and `--ask` runs under it after each map write. The first round is one message: the `--add` that opens it, `--serve` and `--ask`.
- The answer `--ask` prints is one line, `{"round","answers","reopen","go","done","words"}`, with one `{"decision","choice","label","words"}` per question. A `choice` closes its decision as `you`; non-empty `words` beside a null `choice` is the user's own answer; a question with neither stays open for the next round. Fold this line onto the map with `--apply`, unchanged.
- `go` closes every open decision with its recommended answer. `reopen` names earlier decisions that return, with their numbers, in the next round. The top-level `words` is a note typed under the page: read it as the decisions it names.
- Exit 3 means no browser or no answer in time: ask that round in the conversation, never pick for the user. Exit 2 names the field of the map to repair.
- With every decision closed, `--apply` leaves the map with no open decision; run `--ask` once more for `## Checkpoint`. `done` writes the spec; `reopen` returns those decisions as the next round.
- The conversation carries one line per answer: what it closed and what it opened.

## Judgment

- The user's words outrank the click they came with.
- A round asked in the conversation outranks a page nobody answers.
