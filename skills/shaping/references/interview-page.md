# The interview page

Show the whole interview on one page: every decision with its state, and the one question on screen answered with a click. The enemy is the tab opened for a single question, which costs more than the digit it replaces. The overcorrection is a page that answers for the user when no click arrives.

## When it runs

- `interview=page` stands in the session's `exo settings:` line, and the map holds two or more open decisions.
- Every other case asks in the conversation, in the layout `## One question` gives.

## The run folder

`RUN="$(git rev-parse --git-dir)/exo/interview/<topic>"`, or a temp directory outside a git repository. It holds `map.json` and `questions/`, and nothing in it is committed.

## The map file

Write `$RUN/map.json` whole before each question:

```json
{
  "lang": "en",
  "goal": "Harbour masters get their tide alerts out of the app.",
  "asked": "format",
  "words": {},
  "decisions": [
    {
      "id": "format", "name": "What they receive", "state": "open",
      "question": "What should a harbour master get when they export?",
      "changes": "It decides what the port authority receives each quarter.",
      "options": [
        { "id": "csv", "label": "CSV file", "gives": "One row per alert, opens in a spreadsheet.", "recommended": true },
        { "id": "pdf", "label": "PDF report", "gives": "Formatted pages, not editable." }
      ]
    },
    { "id": "range", "name": "Which alerts it covers", "state": "waits", "waitsOn": "format" },
    { "id": "start", "name": "Where they start it", "state": "closed", "answer": "The alerts page", "closedBy": "code", "evidence": "src/modules/alerts/alerts.routes.mjs" }
  ]
}
```

- `asked` names the one open decision on screen. `null` draws the closing review, once every decision is closed.
- `state` is `open`, `waits` with `waitsOn`, or `closed` with `answer`, `closedBy` (`you`, `code` or `exo`) and, for `code`, `evidence`.
- The asked decision carries `question`, `changes` and two to four `options`; one option carries `recommended`.
- `lang` and `words` carry the page's own copy in the conversation's language when that is not English: short sentences and everyday words, under the keys `DEFAULT_WORDS` lists in the script.

## The commands

```bash
node scripts/question-page.mjs --serve "$RUN/questions" --map "$RUN/map.json" 2> "$RUN/page.log"
node scripts/question-page.mjs --ask "$RUN/questions" --map "$RUN/map.json" > "$RUN/answer.json"
```

- Run both; never read the script. `--serve` runs once per interview under the Bash tool's `run_in_background`, and `--ask` runs under it after each map write. The first question is one message: the map, `--serve` and `--ask`.
- The answer is one line, `{"decision","choice","label","words","go"}`. A `choice` closes the decision as `you`. Non-empty `words` beside a null `choice` is the user's own answer: read it as the decision it names. `go` closes every open decision with its recommended answer.
- Exit 3 means no browser or no answer in time: ask that question in the conversation, never pick for the user. Exit 2 names the field of the map to repair.
- After the last answer, write the map with `asked` as `null` and run `--ask` once more. `done` confirms the map, and `words` reopen the decision they name.
- The conversation carries one line per answer: what it closed and what it opened.

## Judgment

- The user's words outrank the click they came with.
- A question asked in the conversation outranks a page nobody answers.
- The map file outranks the conversation after a compaction notice: read it before the next question.
