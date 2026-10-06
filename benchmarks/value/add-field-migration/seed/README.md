# ledgerline

Small invoicing service. Customers have accounts, accounts belong to an organisation, and invoices belong to an account. The data lives in one JSON file.

## Run

```
npm run migrate                      # create or update data/invoicing.json
npm run serve                        # HTTP API on port 4100
node bin/cli.mjs list                # invoices, newest first
node bin/cli.mjs show <invoice id>   # one invoice
node bin/cli.mjs create --account <account id> --line "Consulting|2|15000"
npm test
```

`--db <file>` or the `INVOICING_DB` variable points either entry at another database file.

## HTTP API

| Route | Result |
|---|---|
| `GET /invoices` | every invoice, optional `?account=<id>` |
| `GET /invoices/:id` | one invoice |
| `POST /invoices` | create from `{ accountId, lines, dueDate?, notes? }` |
| `GET /accounts/:id` | one account |

## Migrations

`src/db/migrations/<n>_<name>.mjs`, numbered from 1, each exporting `up(db)`. The runner applies the ones the database has not recorded yet and stores each name with a checksum of its file in `db.migrations`. A migration that was applied is never edited; add a new one instead.
