# Plan: business invoices

## Goal
An invoice taxes each line at the rate in force on the order date, charges a tax-exempt customer no tax, falls due after the customer's payment terms, and spreads an order's shipping over its lines.

## Plan basis
Repository: @@REPO@@
Branch: feat/business-invoices
Worktree setup: ln -s "@@REPO@@/node_modules" node_modules
Land gate: npm run typecheck
Lint: npx eslint

## Success criterion
`npm test` passes.

## Non-goals
- No change to `src/catalog.ts`, `src/discounts.ts` or the order discount rules; no currency other than integer euro cents.

## Context
- `src/tax.ts`: `taxRate(region, category, onDate)` and `computeTax(amountCents, region, category, onDate)` take a required ISO date `onDate` and read the rates in force on it: NL reduced is 600 before 2019-01-01 and 900 from it; DE standard and reduced are 1600 and 500 from 2020-07-01 through 2020-12-31, else 1900 and 700; every other rate stays as it is today.
- `src/invoice.ts` is the only source file calling `computeTax` and passes the order's `placedOn` as `onDate`; `tests/tax.test.ts` is the only test calling `taxRate` or `computeTax`.
- `src/customer.ts` exports the `Customer` type `{ id, name, taxExempt, paymentTermsDays }`, `createCustomer(fields)`, which throws a RangeError unless `paymentTermsDays` is an integer from 0 to 120, and `dueDate(placedOn, customer)`, the ISO date `paymentTermsDays` calendar days after `placedOn` in UTC.
- `src/money.ts` gains `allocateCents(totalCents, weights)`: shares proportional to the weights by largest remainder, the earlier index first on a tie, an even split over all-zero weights, and a RangeError for no weights or a negative weight; the shares always sum to `totalCents`.
- `src/order.ts`: the `Order` type gains an optional `customer` in Task 4 and an optional `shippingCents` in Task 5.
- `src/invoice.ts`, Task 4: a `taxExempt` customer's lines carry 0 tax, and `Invoice.dueOn` is `dueDate(placedOn, customer)`, or `placedOn` for an order with no customer.
- `src/invoice.ts`, Task 5: the order's shipping, 0 when absent, is split over the lines with `allocateCents`, weighted by each line's net after its discount share; each share is taxed with its line at that line's rate, `InvoiceLine.shippingCents` and `Invoice.shippingCents` hold the shares and the total, and `totalCents` includes shipping.
- Tests build orders from `sampleCatalog()` in `tests/support/catalog.ts`.

## Checkpoint
- Blocks first: Task 1, since it changes the `computeTax` signature that `src/invoice.ts` calls.
- Parallel: Tasks 1, 2 and 3.
- Shared state: `src/invoice.ts` and `src/order.ts`, ordered by the Depends on chain.
- Smallest safe split: one task per module, each with its own test file.

## Tasks
### Task 1: feat(tax): apply the rate in force on the order date
Depends on: none | Files: `src/tax.ts`, `src/invoice.ts`, `tests/tax.test.ts` | Data: a per-region array of dated rate periods, each a `{ from, rates }` object | Risk: public signature | Proof: npm test -- tests/tax.test.ts
### Task 2: feat(customer): add customers with payment terms
Depends on: none | Files: `src/customer.ts`, `tests/customer.test.ts` | Data: a `Customer` object | Proof: npm test -- tests/customer.test.ts
### Task 3: feat(money): allocate cents by largest remainder
Depends on: none | Files: `src/money.ts`, `tests/money-allocate.test.ts` | Data: an array of integer cents, one share per weight | Proof: npm test -- tests/money-allocate.test.ts
### Task 4: feat(invoice): exempt customers from tax and set the due date
Depends on: 1, 2 | Files: `src/order.ts`, `src/invoice.ts`, `tests/invoice-customer.test.ts` | Data: an optional `customer` on the existing `Order` object and a `dueOn` string on the `Invoice` object | Proof: npm test -- tests/invoice-customer.test.ts
### Task 5: feat(invoice): spread shipping over the lines and tax it
Depends on: 3, 4 | Files: `src/order.ts`, `src/invoice.ts`, `tests/invoice-shipping.test.ts` | Data: an optional `shippingCents` on the `Order` object and a `shippingCents` number on each `InvoiceLine` and on the `Invoice` | Proof: npm test -- tests/invoice-shipping.test.ts
