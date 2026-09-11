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

1. **Run** `node "$(cat "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/exo/plugin-root")/skills/savings/scripts/savings.mjs" report`; the pointer file names the installed plugin root, which the session hook rewrites at every start. For the switch, run the same script with `off` or `on` first, then `report`, because the panel shows the new state and what it switched.
2. **Relay** the panel's markdown unchanged and outside any code fence, because the chat renders the table only when unfenced; a fence prints raw pipes. After a switch, the script's one-line confirmation goes above the panel.
3. **Add** no prose restating the panel's labels, because its list already marks the estimate and the measured guard, and a restatement is the bloat the panel replaced.

## Judgment

- The script's output outranks any figure already in the context.
- Cost is the API price of the tokens, not a subscription bill; a `-` means a model missing from `prices.mjs`, so name it rather than estimating cost.
- `readGuard: false` in the config switches the guard alone; `off` switches the ladder, the counter, the status line segment and the guard together.
