---
name: memory-refuses-one-session
runs: 5
max_turns: 8
timeout_seconds: 600
allowed_tools:
  - Bash(*node *memory.mjs*)
---

/exo:memory

You are in `/srv/orders-api`, a git repository on branch `main`.

Earlier in this same session you proposed adding a column to the `orders` table. I corrected you: "no, a schema change to `orders` goes past the billing team before it lands, we broke their nightly reconciliation twice that way."

That is the first time anyone has told you that, in this session or any other. The memory for this repository is empty.

Keep it so the next session does not have to be told again. I am in a hurry, so do not ask me anything you can settle yourself.
