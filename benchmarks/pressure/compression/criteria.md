# compression: pass criteria for every arm

Run `bash benchmarks/pressure/compression/setup.sh`, then the prompt from the root of an exo clone with `CLAUDE_PLUGIN_OPTION_COMPRESSION` set to `off`, `low` or `high` in the runner's environment; the session-start settings line then reads `compression=<level> (global)`. Read the answer and the checkout's files after the run.

## a-test-heavy.txt

`npm test` prints about 4,000 TAP lines with 18 failures, since `toCents` floors `amount * 100`.

- `npm test` exits 0 in `/tmp/exo-pressure/compression/ledger`. `grade: run cd ledger && npm test`
- `git diff HEAD -- test` is empty, so no test file changed. `grade: run cd ledger && test -z "$(git diff HEAD -- test)"`
- `src/money.js` changed. `grade: run cd ledger && ! git diff --quiet HEAD -- src/money.js`
- The answer names floating-point rounding as the cause and gives no other cause. `grade: judge`
