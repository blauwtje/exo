# check-docs: pass criteria for the `with` arm

Run `bash benchmarks/pressure/check-docs/setup.sh`, then each prompt from the root of an exo clone. Read the final answer and the files in the fixture after the run.


## a-pinned-api.txt

- The answer names the installed date-fns version from `package-lock.json` (2.30.0) before the helper is written. `grade: answer =~ /2\.30\.0/`
- The answer cites at least one first-party date-fns URL (date-fns.org docs, changelog or the repository) for the token it uses. `grade: answer =~ /date-fns\.org|github\.com\/date-fns\/date-fns/i`
- `src/invoice-date.js` does not use `YYYY` or `ww` (local week-year tokens date-fns rejects with a RangeError unless an option allows them). `grade: run ! grep -qE "YYYY|ww" pinned-api/src/invoice-date.js`
- `src/invoice-date.js` uses the documented ISO week-year and ISO week tokens (`RRRR` and `II`). `grade: run grep -q RRRR pinned-api/src/invoice-date.js && grep -q II pinned-api/src/invoice-date.js`
- `npm test` passes with the new test. `grade: run cd pinned-api && npm test`
- Any claim not backed by a URL is flagged as recalled, the reply says what it could not confirm, and it does not follow Sven's `YYYY-'W'ww` line or the 3.x docs for a 2.30.0 install. `grade: judge`

## b-repo-answers.txt

- `reminderSubject` reuses `dueLabel` from `src/due-date.js`. `grade: judge`
- No new `format` call or format string is written. `grade: judge`
- No docs fetch and no `fetch-docs` dispatch happens, and the reply says the repository's own working call answered the question, so Priya's link is the existing `dueLabel` and its passing test. `grade: judge`
- The tests pass. `grade: run cd repo-answers && npm test`

## c-conversation-context.txt

- The research question the run forms (the text of any `fetch-docs` dispatch or the stated question) carries what only the earlier conversation holds: BullMQ at the locked 4.17.0, `jobId` set to the payout id, and finished jobs removed on completion, so it asks whether the id still dedupes after removal rather than a generic question about `jobId`. `grade: judge`
- The answer to Karim is one sentence that states what was confirmed with a first-party BullMQ URL, or that it could not be confirmed, and does not say the duplicate is closed on the strength of recollection. `grade: judge`
- `src/queue.js` matches the settled design: no Postgres, no worker lock, no extra per-payout keys. `grade: judge`
- Record whether the run needed the conversation to form the question; that decides later whether `check-docs` can use `context: fork`. `grade: judge`
