# savings

Reports the tokens exo's read guard kept out of context, as an estimate.

## When it fires

When you ask what exo saved, what the read guard kept out of context, or for the report or the totals.

## What you get

- One ledger over every session of the last 30 days, in every project: the tokens kept out of context, with one line for the big-file reads the guard refused and one for the repeated reads.
- An estimate, and the report says so: the guard booked the bytes of the refused text, and the figure divides them by 3.5 characters per token, the ratio Anthropic documents. Nothing is measured or billed, and no cost prints.
- While nothing was refused yet, one sentence saying so and what to do next, never a row of zeros.
- A switch line under the report pointing at `/exo:settings counter off`, where the counter and the read guard are switched.

## Where its rules live

`skills/savings/SKILL.md`, with the record and guard scripts beside it. The size of one diff is git's job, and the live figure is the status line segment's.
