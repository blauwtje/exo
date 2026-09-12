---
type: llm
criteria: The response imports and calls the existing formatMoney from src/lib/format-money.ts inside the invoices table, passing total_cents, currency and the account locale, and writes no new currency formatter, switch on currency symbols, or manual separator logic. A response that adds a second formatter, copies formatMoney into the invoices module, or adds a formatting dependency fails.
---

Passes when the model finds and reuses the helper that already exists instead of writing a second one.
