# The interview page

Show the interview on one page: every question of the round as a card, the earlier rounds with what was chosen, and the tree of decisions beside them, sent with one button. The enemy is the tab opened for a single question, which costs more than the digit it replaces. The overcorrection is a page that answers for the user when nothing is sent.

## When it runs

- `interview=page` stands in the session's `exo settings:` line, and the map holds two or more open decisions.
- Every other case asks in the conversation, in the layout `## A round` gives.

## The run folder

`RUN="$(git rev-parse --git-dir)/exo/interview/<topic>"`, or a temp directory outside a git repository. It holds `map.json` and `questions/`, and nothing in it is committed.

## The map file

Write `$RUN/map.json` whole before each round:

```json
{
  "lang": "en",
  "goal": "Harbour masters get their tide alerts out of the app.",
  "round": 2,
  "words": {},
  "decisions": [
    {
      "id": "format", "name": "What they receive", "state": "closed", "number": 1, "round": 1,
      "question": "What should a harbour master get when they export?",
      "answer": "PDF report", "recommended": "CSV file", "closedBy": "you"
    },
    { "id": "start", "name": "Where they start it", "state": "closed", "answer": "The alerts page", "closedBy": "code", "evidence": "src/modules/alerts/alerts.routes.mjs" },
    {
      "id": "range", "name": "Which alerts it covers", "state": "open", "number": 2, "waitsOn": "format",
      "question": "Which alerts should one export hold?",
      "changes": "How long the report is.",
      "why": "Port reports run per quarter.",
      "options": [
        { "id": "quarter", "label": "One quarter", "gives": "Only the last three months.", "recommended": true },
        { "id": "all", "label": "Every alert", "gives": "The whole history in one file." }
      ]
    },
    { "id": "layout", "name": "Page layout", "state": "waits", "waitsOn": "range" }
  ]
}
```

- `round` is the round on screen. An `open` decision with a `number` is asked in it; an `open` one without a `number` waits for the next round. A map with no open decision draws the checkpoint.
- `number` is the question's `Q<n>`, kept once given, so the page and the conversation name a question alike.
- `waitsOn` names the decision above it in the tree, on any state, and `waits` requires it; the page shows what an answer unlocked from these links.
- An asked decision carries `question`, `changes`, `why` and two to four `options`, exactly one of them `recommended`.
- A closed decision carries `answer`, `closedBy` (`you`, `code` or `exo`), `evidence` for `code`, and once it was asked its `round`, its `question` and the `recommended` answer's label.
- `lang` and `words` carry the page's own copy in the conversation's language when that is not English: short sentences and everyday words, under the keys `DEFAULT_WORDS` lists in the script.

## The commands

```bash
node scripts/question-page.mjs --serve "$RUN/questions" --map "$RUN/map.json" 2> "$RUN/page.log"
node scripts/question-page.mjs --ask "$RUN/questions" --map "$RUN/map.json" > "$RUN/answer.json"
```

- Run both; never read the script. `--serve` runs once per interview under the Bash tool's `run_in_background`, and `--ask` runs under it after each map write. The first round is one message: the map, `--serve` and `--ask`.
- The answer is one line, `{"round","answers","reopen","go","done","words"}`, with one `{"decision","choice","label","words"}` per question. A `choice` closes its decision as `you`; non-empty `words` beside a null `choice` is the user's own answer; a question with neither stays open for the next round.
- `go` closes every open decision with its recommended answer. `reopen` names earlier decisions that return, with their numbers, in the next round. The top-level `words` is a note typed under the page: read it as the decisions it names.
- Exit 3 means no browser or no answer in time: ask that round in the conversation, never pick for the user. Exit 2 names the field of the map to repair.
- With every decision closed, write the map with no open decision and run `--ask` once more: that is `## Checkpoint`. `done` writes the spec; `reopen` returns those decisions as the next round.
- The conversation carries one line per answer: what it closed and what it opened.

## Judgment

- The user's words outrank the click they came with.
- A round asked in the conversation outranks a page nobody answers.
- The map file outranks the conversation after a compaction notice: read it before the next round.
