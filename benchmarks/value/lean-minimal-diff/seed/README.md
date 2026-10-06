# fieldbook

Back-office exports for the field-service app: customer and order lists,
the ledger report and the audit log dump. Plain Node, no dependencies.

## Layout

- `src/exports/`: customer and order list exports
- `src/reports/`: the ledger report for the accountants
- `src/audit/`: the audit log dump
- `src/shared/`: helpers used by more than one of the above
- `test/`: `node --test`

## Running the tests

    npm test
