Our nightly batch (`npm run batch`) prints some invoice totals one cent too high. For example, order A-1042 comes out as 193.99 and finance says it should be 193.98.

It looks like `roundMoney()` in `src/money.mjs` rounds up where it should round half-up, so please fix it there. Keep the rounding policy in `docs/rounding-policy.md` as it is, it was agreed with finance.
