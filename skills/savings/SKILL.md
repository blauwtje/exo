---
name: savings
description: Use when the user asks what exo cost, what exo or the read guard has saved or refused, for the savings counter, report, panel or totals, asks to switch exo savings, the ladder or the read guard off or on, or to change the guard's big-file limit. Not for the size of one diff, which git shows; not for the live figure, which the status line segment prints.
argument-hint: "[report, on, off, status or guard-lines <lines>]"
allowed-tools: Bash(node *savings.mjs*)
model: haiku
---

# Savings

Relay the report as the script prints it, never a figure recomputed by hand, and change a switch or the guard's limit with the script, never by editing JSON. The enemy is a total typed from memory that drifts from the counter. The overcorrection is reading the counter's file into the context to explain one number.

## When to use

- The user asks what exo cost, what the read guard refused, or for the counter, the report or the panel.
- The user asks to switch exo savings, the counter or the read guard off or on; the ladder has no switch, so a request to switch it off gets that answer and runs nothing.
- The user asks the guard to refuse fewer or more reads: `guard-lines <lines>` sets the line count above which a whole-file read is refused.
- Not for one change's size: `git diff --stat` answers that.

## The report

The report as the script printed it when this skill loaded:

!`node "${CLAUDE_SKILL_DIR}/scripts/savings.mjs" report`

## The loop

1. **Relay** the report above for a request that only asks for the figures, and run nothing, because a second run is a tool call the reader waits on for the same figures. The exception is a notice in place of the report, such as shell execution disabled by policy: then run `node "${CLAUDE_SKILL_DIR}/scripts/savings.mjs" report`.
2. **Change** with `node "${CLAUDE_SKILL_DIR}/scripts/savings.mjs" off`, `on` or `guard-lines <lines>`, then `report`, because the report above shows the state before the change. The script refuses a limit that is not a whole number of at least 1; relay its error line and change nothing by hand.
3. **Relay** the report unchanged, keeping the ```` ```text ```` fence the script printed around it, because its labels line up only in a monospace block. After a change, the script's one-line confirmation goes above the fence. The script's switch line under the fence, `Turn off with` or `Turn on with`, stays, because it is the only place the reader sees the switch.
4. **Write** nothing of your own above the fence, not the report's `exo savings` line and not the opening line an output style asks for: the report is the whole answer.
5. **Add** no prose of your own under the fence restating its lines, naming them an estimate, converting refused text into tokens or money, or working out a saving or a net, because the report already says the saving is not measured.

## Judgment

- The script's output outranks any figure already in the context.
- The report counts every session the counter holds from the last 30 days, whatever project it ran in; a single project's figure is not reported.
- Measured: the cost, calls and wall time of exo's own work, and the reads the read guard refused with their file text in bytes. There is no saved or net figure, because the refused text was never sent, so it has no token count or price.
- Cost is the API price of the tokens, not a subscription bill; a `-` means a model missing from `prices.mjs`, so name it rather than estimating cost.
- `readGuard: false` in the config switches the guard alone; `off` switches the counter, the status line segment and the guard together. The right-sizing ladder rides in every session either way.
