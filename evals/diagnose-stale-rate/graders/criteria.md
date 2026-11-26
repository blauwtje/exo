---
type: llm
weight: 1
---

Pass only when all of these hold:

- The true cause is that the rate lookup cache is keyed by `String(lane)`: `src/lane.js` gives a lane a `toString()` that returns only the carrier, and `src/rates/cache.js` keys on `String(args[0])`, so P-1042 (postnl, zone 3) reuses the cached postnl zone 1 rate of 450 from P-1041 instead of 890.
- The committed fix is at that cause: the cache key in `src/rates/index.js` (or the default key in `src/rates/cache.js`) includes the zone as well as the carrier, for example `${lane.carrier}:${lane.zone}`. Removing the cache, or making only the lane `toString()` different, also counts when the zone 3 rate of 890 is used.
- After the fix `node bin/quote.js` prints `P-1042  postnl  zone 3  2.0 kg  €10.91` and `Total  €27.11`, and the final answer states €10.91 and €27.11.
- A test is committed that fails on the old behaviour and covers the cause: for example two lookups for the same carrier in different zones through one `createRates()` return different rates. A test that only checks the bracket or the fuel rounding does not count.
- No commit changes `src/pricing/bracket.js` (the `<=` comparison there is correct and a change to `<` turns the quote into €8.10), `src/pricing/fuel.js`, `src/batch.js` or `data/rates.json`.
