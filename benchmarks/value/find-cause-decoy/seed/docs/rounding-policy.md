# Rounding policy

Every step that produces a fraction of a cent (a coupon discount, the tax) is
rounded to whole cents. How it rounds depends on the operation:

| Operation | Mode | Why |
|---|---|---|
| Invoice | half-up | Customer is charged the usual rounded amount. |
| Refund | floor | We never refund more than the proportional charge. |
| Quote | ceil | A quote never comes out below the invoice that follows it. |
| Anything else (shipping, late fees) | half-up | The usual rounded amount. |

A mode applies only while its operation runs. The next operation starts at
half-up again, whatever happened before it, including a failure.

`roundMoney(cents)` in `src/money.mjs` rounds with the current mode. Do not
change the policy above; it was agreed with finance.
