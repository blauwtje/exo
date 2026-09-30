# spec: pass criteria for the `with` arm

Each case runs from its fixture directory under `/tmp/exo-pressure/spec/`, as a multi-turn session resumed after every reply. The criteria come from the grading of the first spec pressure run and the user's decisions on the one-question interview shape; they hold for every message the assistant sends.

## Each question message

- One message holds exactly one costly-or-irreversible question; no later message repeats a point already asked or assumed unless a reply opened a new costly point.
- The message opens with `Question <n> of <total>`; the total may change when an answer opens or closes a costly point.
- No file name, setting or field name, flag, model name, endpoint or other technical term in a question, an option or an assumption line.
- Two or three options, each on its own line lettered `a.`, `b.`, `c.`, holding only what the user gets.
- The recommended option is first and marked the way the active output style marks a recommended choice; only without such a style, `(recommended)`.
- The reason for the recommendation is one short line of its own directly under the options, not inside the option line and not behind a label such as "Why:".
- No "Assuming" list before the final question; the final question carries every assumption under one "Assuming:" line, one plain line each, holding only what the user gets.
- The previous answer is never repeated: no "Recorded:", "Decided:" or similar line.
- No context lines such as "Why this matters:", "Already settled by the code:", "Worth knowing:" or "Note:"; at most one context line above the question, only when it cannot be understood without it.
- The closing line is one short reply hint naming a letter, the user's own words, or `ok` for the recommendation.

## Replies

- A bare letter answers the current question, and the next message holds only the next question.
- "I don't know" on a question gets the difference in about two sentences with one example, then that question again in the same shape.
- A second "I don't know" on the same question takes the recommended option, credited to exo, never to the user.
- `ok` or `go` takes the current and every remaining recommendation and every assumption, and the brief is written next, with no further question.

## Confirmation and the brief

- The answer to the final question is the confirmation: no separate checkpoint message, no "write the brief" question, and the brief follows at once.
- A reply that opens a new costly or irreversible point adds one question, shown by a raised total, before the brief is written.
- No file is written before the final question is answered.

## Scripted replies

The driver sends these replies in order after the first user turn, stopping when the assistant's message holds no question.

- `a-deepseek-worker.txt`: `a` up to four times while the reply is a question, then `ok`.
- `b-tide-export.txt`: `I don't know`, `I don't know`, then `a` up to twice.
- `c-shopping-share.txt`: `b`, then `go`.
- `d-notes-export.txt`: `ok`, sent once, after the single question.
- `e-report-proof.txt`: `ok`, then `go`, each sent only while the reply is a question.

## Case d: one costly point, three routine points

`d-notes-export.txt` opens exactly one costly-or-irreversible point (where the PDF renders) and three routine points the fixture code leaves open (note order on the page, the default file name, the default page size). The `with` arm passes when:

- The first assistant message is `Question 1 of 1` and, being the final question, lists the three routine points under "Assuming:", none of them asked.
- The reply `ok` produces the brief directly, with no second question round.

## Case e: a flaw only running shows

`e-report-proof.txt` runs in `fx-visit-report`, whose tests feed LF strings while `data/sample-visits.csv` has CRLF line endings, so the tests pass and the flaw shows only when the CLI runs on the sample file. The `with` arm passes when the plan's `Proof:` for the CLI task runs the CLI on the sample file.
