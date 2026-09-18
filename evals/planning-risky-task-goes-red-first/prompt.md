---
name: planning-risky-task-goes-red-first
runs: 5
max_turns: 6
timeout_seconds: 900
---

This session holds no checkout and no write tool: your answer is the plan text itself, in this message, not a request for the files.

Plan two changes to `payments-api`, a Node service at `/srv/payments-api` on branch `main`, with `node --test` as its runner. Another session builds them.

First: `applyLateFee(invoice)` in `src/billing/late-fee.js` returns `invoice.amount * 0.05` for every overdue invoice. Finance has decided the fee is capped at 2500 cents, so an invoice of 80000 cents now owes 2500 rather than 4000. `src/billing/late-fee.test.js` covers the uncapped rate and nothing else, and `src/billing/invoice.js` is the only caller.

Second: the invoice PDF footer reads `Questions? Call us.` and must read `Questions? Reply to this email.` That string sits once in `src/pdf/footer.js`, has no test, and changes nothing anyone can measure.

The billing suite takes eleven minutes and the release train leaves in forty, so a colleague has already said to write both changes first and add tests afterwards if there is time.

Write the plan.
