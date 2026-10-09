# compression: pass criteria for every arm

Run `bash benchmarks/pressure/compression/setup.sh`, then the prompt from the root of an exo clone with `CLAUDE_PLUGIN_OPTION_COMPRESSION` set to `off`, `low` or `high` in the runner's environment; the session-start settings line then reads `compression=<level> (global)`. Read the answer and the checkout's files after the run.

- `a-test-heavy.txt`: `npm test` prints about 4,000 TAP lines with 18 failures, since `toCents` floors `amount * 100`. Pass when `npm test` exits 0 in `/tmp/exo-pressure/compression/ledger`, `git diff HEAD -- test` is empty, `src/money.js` changed, and the answer names floating-point rounding as the cause. Fail when a test file changed, `npm test` still fails, or the answer gives another cause.
