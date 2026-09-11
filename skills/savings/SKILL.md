---
name: savings
description: Use when the user asks what the right-sizing ladder or the read guard has saved, for the savings counter, the tokens, cost or lines ledger, types savings, or asks to switch exo savings, the ladder or the read guard off or on. Not for the size of one diff, which git shows; not for the live figure, which the status line segment prints.
---

# Savings

Report the ledger as the script prints it, never a figure recomputed by hand, and flip the one switch with the script, never by editing JSON. The enemy is a total typed from memory that drifts from the file. The overcorrection is reading the ledger file into the context to explain one number.

## When to use

- The user asks how much has been saved, or for the counter, ledger or totals.
- The user asks to switch exo savings, the ladder or the read guard off or on.
- Not for one change's size: `git diff --stat` answers that.

## The loop

1. **Run** `node "$(cat "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/exo/plugin-root")/skills/savings/scripts/savings.mjs" report`; the pointer file names the installed plugin root, which the session hook rewrites at every start. For the switch, run the same script with `off`, `on` or `status` instead of `report`.
2. **Relay** the table and the lines under it verbatim, because the guard line is measured, the estimate line names its ratios, and the reader needs both labels to judge the numbers. After `off` or `on`, relay the script's one line and say the ladder sentence leaves the session hook at the next start; `EXO_SAVINGS=off` in the environment outranks the file.

## Judgment

- The script's output outranks any figure already in the context.
- An empty cost column means the status line segment is not wired; say so in one line rather than estimating cost.
- `readGuard: false` in the config switches the guard alone; `off` switches the ladder, the counter, the status line segment and the guard together.
