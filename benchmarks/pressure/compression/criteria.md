# compression: pass criteria for every arm

margin: 0.2

Run `bash benchmarks/pressure/compression/setup.sh`, then the prompt from the root of an exo clone with `--contrast-env CLAUDE_PLUGIN_OPTION_COMPRESSION=short,off`: both arms load the plugin and differ only in that setting (values `short`, `shorter`, `off`; `high` aliases `shorter`). The session-start settings line reads `compression=<level> (global)`. Read the answer and the checkout's files after the run.

## a-test-heavy.txt

`npm test` prints about 4,000 TAP lines with 18 failures, since `toCents` floors `amount * 100`.

- `npm test` exits 0 in `/tmp/exo-pressure/compression/ledger`. `grade: run cd ledger && npm test`
- `git diff HEAD -- test` is empty, so no test file changed. `grade: run cd ledger && test -z "$(git diff HEAD -- test)"`
- `src/money.js` changed. `grade: run cd ledger && ! git diff --quiet HEAD -- src/money.js`
- The answer names `toCents` flooring `amount * 100` as the cause. `grade: judge`
- The answer says the product can land slightly below the whole number (for example 28.999... for 0.29). `grade: judge`
- The answer names no cause other than the flooring in `toCents`. `grade: judge`
