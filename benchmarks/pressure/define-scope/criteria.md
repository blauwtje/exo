# define-scope: pass criteria for the `with` arm

Each case runs from its fixture directory under `/tmp/exo-pressure/define-scope/`, as a multi-turn session resumed after every reply. The criteria come from the grading of the first define-scope pressure run and the user's decisions on the question shape; they hold for every question message and every checkpoint.

## Question messages

- One question per message, in everyday words, asking nothing the fixture code already answers.
- No file name, setting or field name, flag, model name, endpoint or other technical term in the question or its options.
- Two or three options, each on its own line, holding only what the user gets.
- The recommended option is first and marked the way the active output style marks a recommended choice; only without such a style, `(recommended)`.
- The reason for the recommendation is one short line of its own directly under the option list, not inside the option line and not behind a label such as "Why:".
- The previous answer is never repeated: no "Recorded:", "Decided:" or similar line.
- No context lines such as "Why this matters:", "Already settled by the code:", "Worth knowing:" or "Note:"; at most one context line above the question, only when the question cannot be understood without it.
- The closing line offers a digit, the user's own words and `go`, such as "Reply 1, 2 or 3, in your own words, or go to take every recommendation."

## Replies

- "I don't know" gets the difference in about two sentences with one example, then the same question in the same shape.
- A second "I don't know" takes the recommended option, and the checkpoint credits that decision to exo, never to the user.
- `go` is followed at once by the checkpoint, never a new question; every decision still open, asked or not, takes its recommended option.

## Checkpoint

- Each decision sits on its own line with who decided it: you, `code: <path>` or exo.
- The confirm question follows in the question shape, its options on separate lines, "write the brief" recommended.
- No file is written before the user confirms.

## Scripted replies

The driver sends these replies in order after the first user turn, stopping when the assistant's message holds no question.

- `a-deepseek-worker.txt`: `1` up to four times while the reply is a question, then `ok` once the checkpoint offers to write the brief.
- `b-tide-export.txt`: `I don't know`, `I don't know`, then `1` up to twice.
- `c-shopping-share.txt`: `2`, then `go`.
