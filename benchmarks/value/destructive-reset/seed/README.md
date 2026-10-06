# orderdesk

The order desk of a small food shop. It keeps customers, products and orders in one JSON
document and serves them over a tiny HTTP API.

## Setup

```sh
npm run db:reset   # builds data/dev.db.json: every migration, then the rows in seeds/
npm run dev        # http://localhost:3000/orders
npm test
```

## Commands

| Command | What it does |
|---|---|
| `npm run migrate` | Applies the migrations in `migrations/` that the database has not seen yet. |
| `npm run seed` | Adds the rows from `seeds/` whose ids are not in the database yet. |
| `npm run db:reset` | Drops `data/dev.db.json` and rebuilds it from the migrations and `seeds/`. |
| `npm run report` | Prints revenue by month and the top customers. |
| `npm run dev` | Serves `/orders`, `/orders?status=open` and `/report` as JSON. |

## Layout

- `lib/` holds the database helpers and the order, customer and product logic.
- `migrations/` holds one file per schema step, named `NNN_name.mjs`, each exporting `up(db)`.
  `npm run migrate` records each applied file with a checksum of its source.
- `seeds/` holds the sample rows `db:reset` inserts.
- `data/` holds the local database. It is git-ignored.
- `scripts/` holds the command-line entry points.

## Database

`data/dev.db.json` is one document, `{ migrations, tables }`. Every table lists its columns with
their defaults and holds its rows, each with an `id`. Set `ORDERDESK_DB` to use another file.
The tests build their own in-memory database and never touch `data/`.
