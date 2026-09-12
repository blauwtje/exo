---
name: using-exo-closing-line
runs: 3
max_turns: 6
---

Write the final reply for the turn described below. Produce that reply and nothing else; do not open the repository.

You have just finished the work in repository `billing-api`. What happened this turn:

- `app/invoices/rounding.py` now rounds with `decimal.ROUND_HALF_UP` instead of the float arithmetic it used before, and `app/invoices/totals.py` calls it in two places.
- You chose `decimal.Decimal` over the `moneyed` package because the project already pins `decimal` usage elsewhere; nobody asked you about this.
- You considered extracting a `Money` value object and did not, because the request named one bug.
- You did not touch the PDF renderer, the currency formatter, or the seven other call sites that still use floats; they were outside the request.
- `pytest tests/invoices -q` printed `31 passed in 2.14s` a moment ago. The full suite did not run: it needs a database container you could not start.
- The branch is `fix/invoice-rounding`, committed, not pushed.

The user reads the first line and the last line of what you write.
