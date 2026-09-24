# The decision map

The interview keeps one shared record, and the question script owns every write onto it through `--add`, `--apply` and `--text`; the session never edits it by hand. The enemy is a map hand-edited into a bad state. The overcorrection is asking the user to repeat an answer the file already holds. Read `$RUN/map.json`, written only by `question-page.mjs`, before the first round, in page mode and in the conversation alike.

## The run folder

`RUN="$(git rev-parse --git-dir)/exo/interview/<topic>"`, or a temp directory outside a git repository. It holds `map.json` and `questions/`, and nothing in it is committed.

## The map format

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
- `lang` and `words` carry the page's and the chat's own copy in the conversation's language when that is not English: short sentences and everyday words, under the keys `DEFAULT_WORDS` (`question-page.mjs`) and `TEXT_WORDS` (`round-text.mjs`) list.

## What the session writes

- `--add`'s `decisions` entries carry `id` and either the fields of a question still to ask (`name`, `waitsOn`, `question`, `changes`, `why`, `options`), or `state:"closed"` with `answer`, `closedBy:"code"` and `evidence`, for a decision the code already settles.
- The session never sets `round`, `number`, `recommended`, or a `you`/`exo` `closedBy`: the script derives every one of them from the answer it applies and the round it picks.
- Top-level `goal`, `lang` and `words` may ride along on any `--add` call.

## The three commands

```bash
node scripts/question-page.mjs --map "$RUN/map.json" --add "$RUN/decisions.json"
node scripts/question-page.mjs --map "$RUN/map.json" --apply "$RUN/answer.json"
node scripts/question-page.mjs --map "$RUN/map.json" --text
```

- Never write `map.json` by hand. `--add` and `--apply` may both appear in one call, `--apply` running first, and `--text` may follow either in the same call.
- `--add` creates the map (`round: 1`) when none exists, appends a new id, and merges given fields onto an existing non-closed one; a `number`, a `round`, or an already-closed id in the file exits 2 naming the field.
- `--apply` takes the `--ask` line as is, or one the model writes from a chat reply, `{"round","answers","reopen","go","done","words"}`; `answer.round !== map.round` exits 2, guarding a double apply.
- `--text` alone reads and prints the map's current round or checkpoint in the layout `## A round` and `## Checkpoint` give; run it after `--add`/`--apply` for the round that follows.

## Stdout

Each change prints one line: `closed <id> Q<n>: <answer> (<closer>)`, `opened <id>`, `read <id>: <words>` (an own answer the session settles with a follow-up `--add`), `need <id>` (a ready decision still missing `question`/`changes`/`why`/`options`), or `note: <note>` (a top-level `words`). The call ends on `round=<r> asked=<ids>`, `round=<r> checkpoint`, or `round=<r> draft` while any `need` line stands.

## Judgment

- The map file outranks the conversation after a compaction notice: read it before the next round, in any mode.
