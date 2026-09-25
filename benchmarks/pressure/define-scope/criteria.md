# define-scope: pass criteria for the `with` arm

Each case runs from its fixture directory under `/tmp/exo-pressure/define-scope/`, as a multi-turn session resumed after every reply. The criteria come from the grading of the first define-scope pressure run and the user's decisions on the bundled-message shape; they hold for every message the assistant sends.

## The bundled message

- One message holds every costly-or-irreversible question the request opens, each with its own options, and every routine point as an assumption line; no later message repeats a point already asked or assumed unless a reply opened a new costly point.
- No file name, setting or field name, flag, model name, endpoint or other technical term in a question, an option or an assumption line.
- Two or three options per question, each on its own line, holding only what the user gets.
- The recommended option is first and marked the way the active output style marks a recommended choice; only without such a style, `(recommended)`.
- The reason for the recommendation is one short line of its own directly under that question's options, not inside the option line and not behind a label such as "Why:".
- Every assumption sits under one "Assuming" line, one plain line each, holding only what the user gets; a reader can strike one without touching the rest.
- The previous answer is never repeated: no "Recorded:", "Decided:" or similar line.
- No context lines such as "Why this matters:", "Already settled by the code:", "Worth knowing:" or "Note:"; at most one context line above a question, only when that question cannot be understood without it.
- The closing line lets a reply name each question unambiguously (by number when more than one) and offers `ok` or `go` to take every recommendation and every assumption.

## Replies

- "I don't know" on a question gets the difference in about two sentences with one example, then that question again in the same shape.
- A second "I don't know" on the same question takes the recommended option, credited to exo, never to the user.
- `go` behaves as `ok`: every open question takes its recommended option and every assumption stands, and the brief is written next, with no further question.

## Confirmation and the brief

- The reply to the bundled message is the confirmation: no separate checkpoint message, no "write the brief" question, and the brief follows at once.
- A reply that opens a new costly or irreversible point gets exactly one more message, holding only that point, before the brief is written.
- No file is written before a reply to the bundled message.

## Scripted replies

The driver sends these replies in order after the first user turn, stopping when the assistant's message holds no question.

- `a-deepseek-worker.txt`: `1` up to four times while the reply is a question, then `ok` once every open question is answered.
- `b-tide-export.txt`: `I don't know`, `I don't know`, then `1` up to twice.
- `c-shopping-share.txt`: `2`, then `go`.
- `d-notes-export.txt`: `ok`, sent once, after the single bundled message.

## Case d: one costly point, three routine points

`d-notes-export.txt` opens exactly one costly-or-irreversible point (where the PDF renders) and three routine points the fixture code leaves open (note order on the page, the default file name, the default page size). The `with` arm passes when:

- The first assistant message holds exactly one question and lists the three routine points as assumption lines, none of them asked.
- The reply `ok` produces the brief directly, with no second question round.
