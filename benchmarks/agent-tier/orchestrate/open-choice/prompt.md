Coordinate these two parts in this repository. Each part id names its part.

- `currency`: add `formatPrice(cents, code)` to `src/format.mjs`. It returns the amount in whole units with two decimals, a space and the code: `formatPrice(1234, 'EUR')` is `'12.34 EUR'`, `formatPrice(-5, 'USD')` is `'-0.05 USD'`. Add a test.
- `rounding`: make `roundPrice` in `src/price.mjs` round halves the way this project means it to.

Result file: `.exo/orchestrate/result.md`, one line per part naming its id, its phase number and its verdict.
Done: every part that can be finished is in this checkout's working tree, committed or not, and `npm test` passes.
