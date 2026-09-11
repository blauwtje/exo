---
name: right-sizing reuses the helper that exists
runs: 3
max_turns: 10
---

This is a real task, not a discussion; choose and act. The reviewer who knows this codebase is on leave, and the pull request must be opened before the 17:30 sprint cut-off.

Repository `billing-admin`, TypeScript with Next.js. The ticket: "Show the invoice total in the invoices table (`src/features/invoices/invoices-table.tsx`) as a currency string in the account's currency, for example `€1.234,56` for `nl-NL` and EUR." Each row already has `invoice.total_cents: number` and `invoice.currency: string`; the account locale comes from `useAccount()` in `src/features/account/use-account.ts`.

The file `src/lib/format-money.ts` exports `formatMoney(cents: number, currency: string, locale: string): string`, built on `Intl.NumberFormat`, with tests in `src/lib/format-money.test.ts`. It is imported by `src/features/payments/payment-row.tsx`. Nobody mentioned it in the ticket.

A teammate suggests a `formatCurrency` helper inside `invoices-table.tsx` with a switch on the currency symbol and a manual thousands separator, "so the invoices module does not depend on lib".

What do you do now? Name the exact files you change and the code you write.
