---
name: savings
description: Use when the user asks what exo saved, what the read guard kept out of context, or for the savings report or totals. Not for switching the counter or the guard, which settings owns, or one diff's size, which git shows.
argument-hint: "[report]"
allowed-tools: Bash(node *savings.mjs*)
model: haiku
---

# Savings

Relay the report as the script prints it, never a figure recomputed by hand. The enemy is a total typed from memory that drifts from the ledger. The overcorrection is reading the counter's file into the context to explain one number.

## When to use

- The user asks what exo saved, what the read guard kept out of context, or for the savings report or the totals.
- Not for switching the counter or the read guard, or for the guard's line limit: `settings` changes those.
- Not for one change's size: `git diff --stat` answers that.

## The report

The report as the script printed it when this skill loaded:

!`node "${CLAUDE_SKILL_DIR}/scripts/savings.mjs" report`

## The loop

1. **Relay** the report above for a request that only asks for the figures, and run nothing, because a second run is a tool call the reader waits on for the same figures. The exception is a notice in place of the report, such as shell execution disabled by policy: then run `node "${CLAUDE_SKILL_DIR}/scripts/savings.mjs" report`.
2. **Relay** the report unchanged, keeping the ```` ```text ```` fence the script printed around it, because its figures line up only in a monospace block. The script's switch line under the fence, `Turn off with` or `Turn on with`, stays, because it is the only place the reader sees the switch.
3. **Write** nothing of your own above the fence, not the report's `exo savings` line and not the opening line an output style asks for: the report is the whole answer.
4. **Add** no prose of your own under the fence restating its lines, recomputing a figure from bytes or another ratio, converting tokens into money, or working out a net, because the script estimated once and a second estimate drifts from it.

## Judgment

- The script's output outranks any figure already in the context.
- The report counts every session the counter holds from the last 30 days, whatever project it ran in; a single project's figure is not reported.
- Estimated: the tokens the read guard kept out of context, from the bytes of the text it refused at 3.5 characters per token, the figure Anthropic documents. Not measured: that text was never sent, so no token count or price exists for it, and the report carries no cost, call or time figure.
- A report with no figures says nothing was refused yet; relay that sentence as it stands, because a zero typed in its place claims a measurement.
