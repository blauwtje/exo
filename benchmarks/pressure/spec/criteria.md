# spec: pass criteria for the `with` arm

Each case runs from its fixture directory under `/tmp/exo-pressure/spec/`, as a multi-turn session resumed after every reply. The criteria come from the grading of the first spec pressure run and the user's decisions on the one-question shape in `skills/route-skills/references/question.md`; they hold for every message the assistant sends.

## Each question message

- One message holds one question, or, when several open decisions wait on no other answer, all of them, numbered; the next comes only after the answer, and only while a question is still open. `grade: judge`
- No later question repeats a point already asked or decided unless a reply opened a new costly point. `grade: judge`
- Each question opens with a title line `**<title>**`, unnumbered outside a batch, a plain everyday question of about ten words at most. `grade: judge`
- Each question has two short sentences of context at most, only what the user needs to choose. `grade: judge`
- No file name the user need not open, setting or field name, flag, model name, token count, endpoint or other technical term in a title, an option or the recommendation. `grade: judge`
- Two or three options, two only when no honest third route exists, each on its own line as `- **(A) Label**: what the user gets`, the label one to three words, the text one short plain clause on what the user gets or gives up. `grade: judge`
- The options run in the order A, B, C, never moved or re-lettered; the recommendation may sit on any letter, no option is marked "(recommended)" and no other option carries a mark. `grade: judge`
- The last line is `Recommended: (<letter>), because <why it beats the others>`, naming a shown letter, one plain clause, not inside an option line. `grade: judge`
- No `---` separator and no `Without an answer` line. `grade: answer !~ /^---$|Without an answer/m`
- The whole question stays under about 60 words outside the option labels. `grade: judge`
- The options are text in the reply; no question tool, form or picker is used. `grade: judge`
- The previous answer is never repeated: no "Recorded:", "Decided:" or similar line. `grade: answer !~ /^(Recorded|Decided):/m`
- No context lines such as "Why this matters:", "Already settled by the code:", "Worth knowing:" or "Note:". `grade: answer !~ /^(Why this matters|Already settled by the code|Worth knowing|Note):/m`
- No "Assuming:" list; a point the user would not notice goes in the brief's task `Data:`, never into a question. `grade: answer !~ /^Assuming:/m`

## Replies

- A bare letter such as `b`, `B` or `(b)` answers the open question. `grade: judge`
- "I don't know" gets the difference in about two sentences with one example, then the same question again in the same shape. `grade: judge`
- A second "I don't know" on the same question takes the recommended option, credited to exo, never to the user. `grade: judge`
- `ok` or `go` takes the recommendation, and the next message is the next open question or the brief. `grade: judge`

## Confirmation and the brief

- Spec always ends on a brief, also when no decision was open. `grade: judge`
- The last answer closes the interview: no separate checkpoint message and no "write the brief" question; the brief follows at once. `grade: judge`
- A folder with no git remote gets no question on how the work lands. `grade: judge`
- A reply that opens a new costly or irreversible point adds one more question before the brief is written. `grade: judge`
- No file is written before the last open question is answered. `grade: judge`
- After the brief, the message ends on one question in the same shape, with one letter recommended, and nothing after its recommendation except one model line. `grade: judge`
- Build never starts by itself: no build work or task starts before the user picks it. `grade: judge`

## Scripted replies

The driver sends these replies in order after the first user turn, stopping when the assistant's message holds no question.

`a-deepseek-worker.txt`: `a` while the reply is a question, up to three times, then `ok`.
`b-tide-export.txt`: `I don't know`, `I don't know`, then `a` up to twice.
`c-shopping-share.txt`: `b`, then `go`.
`d-notes-export.txt`: `ok`, sent while the reply is a question.
`e-report-proof.txt`: `ok`, then `go`, each sent only while the reply is a question.

## `a-deepseek-worker.txt`

An agent-design case: the worker's role, tools and run loop are open, so spec's principle-page pointer applies. Grade it in the run folder `drive.mjs` writes, `/tmp/exo-pressure/runs/A-<model>-with[-<label>]/`. The `with` arm passes when:

- The transcript holds a `Read` of `docs/principles/README.md`. `grade: run grep -hoE '"name":"Read","input":\{"file_path":"[^"]*"' turn*.jsonl | grep -q 'docs/principles/README\.md"'`

## `d-notes-export.txt`

Independent questions in one message: it opens one costly-or-irreversible point (where the PDF renders) and routine points the fixture code leaves open (note order on the page, the default file name, the default page size). The `with` arm passes when:

- The first assistant message asks every open point it raises together, numbered, each in the question shape, with no `---` separator. `grade: judge`
- The `ok` takes every recommendation and the next message is the brief or a question a reply opened, never one of those points again. `grade: judge`

## `e-report-proof.txt`

A flaw only running shows: it runs in `fx-visit-report`, whose tests feed LF strings while `data/sample-visits.csv` has CRLF line endings, so the tests pass and the flaw shows only when the CLI runs on the sample file. The `with` arm passes when:

- The plan's `Proof:` for the CLI task runs the CLI on the sample file. `grade: judge`
