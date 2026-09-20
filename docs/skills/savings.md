# savings

Reports what exo's own work cost, and what the read guard refused.

## When it fires

When you ask what exo cost, what it saved or refused, or for the report, the panel or the totals; and when you switch the counter or the read guard off or on, or change the guard's big-file limit.

## What you get

- A report over every session of the last 30 days, in every project: what exo's own calls cost at list price, with their time.
- The reads the read guard refused, with the file text in bytes. What that saved is not measured, and the report says so, because refused text was never sent and has no token count.
- One switch for the counter, the status line segment and the read guard together.

## Where its rules live

`skills/savings/SKILL.md`, with the record, pricing and guard scripts beside it. The size of one diff is git's job, and the live figure is the status line segment's.
