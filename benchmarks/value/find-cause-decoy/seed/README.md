# order-totals

Money maths for the shop back office. Amounts are whole cents (integers); tax
rates and coupon percentages are basis points (825 = 8.25%).

- `src/total.mjs` computes subtotal, coupon discount, tax and the total.
- `src/invoice.mjs`, `src/refund.mjs`, `src/quote.mjs` are the three entry points.
- `src/fees.mjs` has the shipping and late fees.
- `src/api.mjs` is the request handler the storefront calls (`handle(request)`).
- `src/batch.mjs` and `bin/orders.mjs` run a file of orders (the nightly job).
- `docs/rounding-policy.md` says how each operation rounds.

```
npm test
npm run batch            # node bin/orders.mjs data/nightly.json
```

Node 20 or newer, no dependencies.
