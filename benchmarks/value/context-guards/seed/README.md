# settlement-report

Monthly settlement report for the payment processor export. It reads the
transactions CSV, converts every settled amount to EUR and prints one JSON
document with the total and the total per merchant.

    npm run report                # the March 2026 files under data/
    node bin/report.mjs --transactions a.csv --fx b.csv --merchants c.csv
    npm test

## Rules

- Only rows with `status` = `settled` count; `pending` and `failed` do not.
- A `txn_id` that repeats counts once, the first row wins.
- Refunds are negative amounts and reduce the total.
- An amount is in the row's currency; it is converted to EUR with the rate
  published for the row's date (`fx-*.csv`, EUR per one unit).
- A date with no published rate uses the latest earlier rate of that currency.

## Output

The report goes to stdout. The log goes to stderr; `LOG_LEVEL` is `debug`,
`info`, `warn` or `error` (default `debug`).

## Tests

`test/march.golden.test.mjs` keeps a snapshot of the March report. After an
intended change to the numbers, refresh it with `UPDATE_GOLDEN=1 npm test`.
