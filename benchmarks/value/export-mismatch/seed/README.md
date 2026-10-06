# billing-export

Monthly billing for the finance team. Two systems feed it: `cardsvc`, the card
processor's event log, and `ledger`, the invoicing system's entry export. Every
customer is billed in its own currency; every total is reported in EUR.

```
npm run export -- 2026-03       # writes exports/2026-03.csv
npm run dashboard -- 2026-03    # per-customer totals on the terminal
npm test
```

## Data

Everything the tools read sits under `data/` (or the folder `--data` names):

| Path | Content |
|---|---|
| `customers.csv` | `id,name,timezone,currency,plan`; the timezone is the account's own |
| `fx/<month>.csv` | `date,currency,rate`: EUR per one unit of the currency, one row per day |
| `sources/cardsvc/<month>.jsonl` | one JSON event per line: charges and refunds |
| `sources/ledger/<month>.csv` | invoices and credit notes, amounts in major units |

The processor redelivers some events and the ledger export repeats some entries,
so a month's files can hold the same row twice.

## Layout

- `src/ingest/` reads both sources into one row shape (`source`, `id`,
  `customerId`, `amountMinor`, `currency`, `status`, `bookedAt`).
- `src/export/` is the export: normalize to EUR, keep billable rows, dedupe,
  aggregate per customer, write the CSV.
- `src/dashboard/` is the finance dashboard's own per-customer summary.
- `src/model/` loads customers and FX rates; `src/lib/` holds CSV, money and date helpers.
