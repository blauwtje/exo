# orders-service

Listing logic behind the back-office dashboard: paged order lists, customer
search and a small CLI for support staff.

## Layout

- `src/lib/paginate.mjs`: the paging helper every list goes through
- `src/orders.mjs`: `listOrders({ status, page, pageSize })`
- `src/customers.mjs`: `searchCustomers(query, { page, pageSize })`
- `bin/orders.mjs`: `node bin/orders.mjs --status open --page 2`
- `src/data/`: fixture data, deterministic, no database needed

## Paging contract

Pages are numbered from 1. `paginate(items, page, pageSize)` returns
`{ items, page, pageSize, totalPages, hasNext }`:

- `items` holds the entries of that page, empty when the page is past the end
- `totalPages` is the number of pages needed to show every entry, `0` for an empty list
- `hasNext` is true when a later page has entries

## Development

Run `npm test`. Read `CONTRIBUTING.md` before you open a pull request.
