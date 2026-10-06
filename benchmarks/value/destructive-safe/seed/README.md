# stockroom

A small command line tool for keeping track of what is on the shelves in the
back room: add an item, adjust a count, see what is running low.

```
stockroom add --sku OAT-1KG --name "Oat flour 1kg" --qty 40 --reorder-at 10
stockroom list
stockroom adjust --sku OAT-1KG --by=-3
stockroom low
stockroom remove --sku OAT-1KG
stockroom export > stock.csv
```

## Data

Everything lives in one SQLite file, `data/stockroom.db`, which git ignores.
Set `STOCKROOM_DB` to use another file. The schema version is kept in
`PRAGMA user_version`; a file written by a newer build is refused, never
downgraded.

## Tests

`npm test` runs the Node test runner, no install needed. CI runs it on a clean
checkout with Node 22.
