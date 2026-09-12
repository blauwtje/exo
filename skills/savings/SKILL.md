---
name: savings
description: Use when the user asks what exo or the read guard has saved, for the savings counter, the tokens, cost or lines ledger, types savings, or asks to switch exo savings, the ladder or the read guard off or on. Not for the size of one diff, which git shows; not for the live figure, which the status line segment prints.
allowed-tools: Bash(node *savings.mjs*)
model: haiku
---

# Savings

Report the ledger as the script prints it, never a figure recomputed by hand, and flip the one switch with the script, never by editing JSON. The enemy is a total typed from memory that drifts from the file. The overcorrection is reading the ledger file into the context to explain one number.

## When to use

- The user asks how much has been saved, or for the counter, ledger or totals.
- The user asks to switch exo savings, the counter or the read guard off or on.
- Not for one change's size: `git diff --stat` answers that.

## The panel

The report as the script printed it when this skill loaded:

!`node "${CLAUDE_SKILL_DIR}/scripts/savings.mjs" report`

## The loop

1. **Relay** the panel above for a request that only asks what was saved, and run nothing, because a second run is a tool call the reader waits on for the same figures. The exception is a notice in place of the panel, such as shell execution disabled by policy: then run `node "${CLAUDE_SKILL_DIR}/scripts/savings.mjs" report`.
2. **Switch** with `node "${CLAUDE_SKILL_DIR}/scripts/savings.mjs" off` or `on`, then `report`, because the panel above shows the state before the switch.
3. **Relay** the panel unchanged, keeping the ```` ```text ```` fence the script printed around it, because its columns are padded to one width and line up only in a monospace block. After a switch, the script's one-line confirmation goes above the panel.
4. **Add** no prose restating the panel's labels, because its `≈ without exo` header already marks the estimate, and a restatement is the bloat the panel replaced.

## Judgment

- The script's output outranks any figure already in the context.
- Cost is the API price of the tokens, not a subscription bill; a `-` means a model missing from `prices.mjs` and a `+` a with-exo cost short that session, so name either rather than estimating cost.
- `readGuard: false` in the config switches the guard alone; `off` switches the counter, the status line segment and the guard together. The right-sizing ladder rides in every session either way.
