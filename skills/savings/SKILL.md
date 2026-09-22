---
name: savings
description: Use when the user asks what exo cost or saved, what the read guard refused, or for the savings report, panel or totals. Not for switching the counter or the guard, which settings owns, or one diff's size, which git shows.
argument-hint: "[report]"
allowed-tools: Bash(node *savings.mjs*)
model: haiku
---

# Savings

Relay the report as the script prints it, never a figure recomputed by hand. The enemy is a total typed from memory that drifts from the counter. The overcorrection is reading the counter's file into the context to explain one number.

## When to use

- The user asks what exo cost, what the read guard refused, or for the counter's report, the panel or the totals.
- Not for switching the counter or the read guard, or for the guard's line limit: `settings` changes those.
- Not for one change's size: `git diff --stat` answers that.

## The report

The report as the script printed it when this skill loaded:

!`node "${CLAUDE_SKILL_DIR}/scripts/savings.mjs" report`

## The loop

1. **Relay** the report above for a request that only asks for the figures, and run nothing, because a second run is a tool call the reader waits on for the same figures. The exception is a notice in place of the report, such as shell execution disabled by policy: then run `node "${CLAUDE_SKILL_DIR}/scripts/savings.mjs" report`.
2. **Relay** the report unchanged, keeping the ```` ```text ```` fence the script printed around it, because its labels line up only in a monospace block. The script's switch line under the fence, `Turn off with` or `Turn on with`, stays, because it is the only place the reader sees the switch.
3. **Write** nothing of your own above the fence, not the report's `exo savings` line and not the opening line an output style asks for: the report is the whole answer.
4. **Add** no prose of your own under the fence restating its lines, naming them an estimate, converting refused text into tokens or money, or working out a saving or a net, because the report already says the saving is not measured.

## Judgment

- The script's output outranks any figure already in the context.
- The report counts every session the counter holds from the last 30 days, whatever project it ran in; a single project's figure is not reported.
- Measured: the cost, calls and wall time of exo's own work, and the reads the read guard refused with their file text in bytes. There is no saved or net figure, because the refused text was never sent, so it has no token count or price.
- Cost is the API price of the tokens, not a subscription bill; a `-` means a model missing from `prices.mjs`, so name it rather than estimating cost.
