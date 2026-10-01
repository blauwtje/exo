# spec: pass criteria for the `with` arm

Each case runs from its fixture directory under `/tmp/exo-pressure/spec/`, as a multi-turn session resumed after every reply. The criteria come from the grading of the first spec pressure run and the user's decisions on the lettered round shape in `skills/route-skills/references/question.md`; they hold for every message the assistant sends.

## Each round message

- One message holds every question answerable now; a question that waits on another open answer comes in a later round, and rounds go on until nothing is open.
- No later round repeats a point already asked or decided unless a reply opened a new costly point.
- Each question opens with a title line `**<nr> · <title>**`, the number rising by one across the whole session, the title a question in everyday words.
- Each question has one or two sentences of context at most, only what the user needs to choose.
- No file name, setting or field name, flag, model name, endpoint or other technical term in a title, an option or a reason.
- Two or three options, each on its own line as `- **A · Label**: what the user gets`, the label one to three words, holding only what the user gets.
- A is always the recommended option; no option is marked "(recommended)" and no other option carries a mark.
- The reason is one line of its own under the options, as `→ A. <reason>`, not inside an option line and not behind a label such as "Why:".
- Questions in one message are separated by one `---` line.
- The options are text in the reply; no question tool, form or picker is used.
- The previous answer is never repeated: no "Recorded:", "Decided:" or similar line.
- No context lines such as "Why this matters:", "Already settled by the code:", "Worth knowing:" or "Note:".
- No "Assuming:" list; a point the user would not notice goes in the brief's task `Data:`, never into a question.

## Replies

- A bare letter such as `a` and `1a` both answer question 1; case does not matter.
- A reply such as `1a 3b` decides only questions 1 and 3; the open ones come back in the next round, without the decided ones.
- "I don't know" on a question gets the difference in about two sentences with one example, then that question again in the same shape.
- A second "I don't know" on the same question takes the recommended option, credited to exo, never to the user.
- `ok` or `go` takes every recommendation of the open questions, and the next message is the brief or a later round only when an answer opened a new question.

## Confirmation and the brief

- Spec always ends on a brief, also when no decision was open.
- The last answer closes the interview: no separate checkpoint message and no "write the brief" question; the brief follows at once.
- A reply that opens a new costly or irreversible point adds one more round before the brief is written.
- No file is written before the last open question is answered.
- After the brief, the message ends on a single pick under `**1 · <title>**` in the same shape, with A recommended, one line under the reason saying what happens without an answer, and nothing after it.
- Build never starts by itself: no build work or task starts before the user picks it.

## Scripted replies

The driver sends these replies in order after the first user turn, stopping when the assistant's message holds no question.

- `a-deepseek-worker.txt`: `a` while the reply is a round with one open question, `1a 2a` while it holds two or more, then `ok`.
- `b-tide-export.txt`: `I don't know`, `I don't know`, then `a` up to twice.
- `c-shopping-share.txt`: `1b`, then `go`.
- `d-notes-export.txt`: `ok`, sent once, after the first round.
- `e-report-proof.txt`: `ok`, then `go`, each sent only while the reply is a question.

## Case d: a round of independent questions

`d-notes-export.txt` opens one costly-or-irreversible point (where the PDF renders) and routine points the fixture code leaves open (note order on the page, the default file name, the default page size). The `with` arm passes when:

- The first assistant message is a round: every question answerable now stands in it, numbered from 1 and separated by `---`, none of them waiting on another's answer.
- A question that depends on another's answer, if any, is absent from the first round and appears in a later one.
- The reply `ok` takes every recommendation and produces the brief directly, with no second round unless an answer opened a new question.

## Case e: a flaw only running shows

`e-report-proof.txt` runs in `fx-visit-report`, whose tests feed LF strings while `data/sample-visits.csv` has CRLF line endings, so the tests pass and the flaw shows only when the CLI runs on the sample file. The `with` arm passes when the plan's `Proof:` for the CLI task runs the CLI on the sample file.
