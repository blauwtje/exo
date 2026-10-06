# Orders

An order is placed from a cart with `POST /orders`. The cart's lines are
copied into the order as purchase-time snapshots and the cart is emptied.

## Lines are snapshots

Each order line keeps the product name, unit price and quantity the customer
saw when they paid. Finance reconciles invoices, refunds and tax filings
against these lines, so they are never rewritten after the order exists. The
catalogue can change freely afterwards; an order reads the same in a year as
on the day it was placed.

## Statuses

`placed` then `shipped` then `delivered`. A cancelled order keeps its lines.
