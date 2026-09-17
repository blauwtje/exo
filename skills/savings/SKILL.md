---
name: savings
description: Use when the user asks what exo cost, what exo or the read guard has saved or held back, for the savings counter, report, panel or totals, asks to switch exo savings, the ladder or the read guard off or on, or to change the guard's big-file limit. Not for the size of one diff, which git shows; not for the live figure, which the status line segment prints.
argument-hint: "[report, on, off, status or guard-lines <lines>]"
allowed-tools: Bash(node *savings.mjs*)
model: haiku
---

# Savings

Relay the savings report as the script prints it, never a figure recomputed by hand, and change a switch or the guard's limit with the script, never by editing JSON. The enemy is a total typed from memory that drifts from the counter. The overcorrection is reading the counter's file into the context to explain one number.

## When to use

- The user asks what exo cost, what the read guard held back, or for the counter, the report or the panel.
- The user asks to switch exo savings, the counter or the read guard off or on; the ladder has no switch, so a request to switch it off gets that answer and runs nothing.
- The user asks the guard to refuse fewer or more reads: `guard-lines <lines>` sets the line count above which a whole-file read is refused.
- Not for one change's size: `git diff --stat` answers that.

## The report

The report as the script printed it when this skill loaded:

!`node "${CLAUDE_SKILL_DIR}/scripts/savings.mjs" report`

## The loop

1. **Relay** the report above for a request that only asks for the figures, and run nothing, because a second run is a tool call the reader waits on for the same figures. The exception is a notice in place of the report, such as shell execution disabled by policy: then run `node "${CLAUDE_SKILL_DIR}/scripts/savings.mjs" report`.
2. **Change** with `node "${CLAUDE_SKILL_DIR}/scripts/savings.mjs" off`, `on` or `guard-lines <lines>`, then `report`, because the report above shows the state before the change. The script refuses a limit that is not a whole number of at least 1; relay its error line and change nothing by hand.
3. **Relay** the report unchanged, keeping the ```` ```text ```` fence the script printed around it, because its tables are padded to one width and line up only in a monospace block. After a change, the script's one-line confirmation goes above the fence.
4. **Write** nothing of your own above the fence, not the report's `exo savings report` title and not the opening line an output style asks for: the report is the whole answer, and a line above it repeats what the reader is about to read.
5. **Add** no prose under the fence restating the report's rows, naming them an estimate, explaining the cost basis or working out a net, because the report already says what it measures and why it prints no net.

## Judgment

- The script's output outranks any figure already in the context.
- The report counts every session the counter holds from the last 30 days, whatever project it ran in; a single project's figure is not reported.
- Measured: each guard's refusals with the bytes they held back, and the tokens, price and wall time of the calls that were exo's own work, split into skill loads and re-reads after a refusal, plus exo's hook time. Not measured: helpers, the ladder and the instructions the session hook adds, and the report marks each. There is no saved or net figure, because cost and held-back text are different units and what the same work would have cost without exo is not observable in a session that ran once.
- Cost is the API price of the tokens, not a subscription bill; a `-` means a model missing from `prices.mjs`, so name it rather than estimating cost.
- `readGuard: false` in the config switches the guard alone; `off` switches the counter, the status line segment and the guard together. The right-sizing ladder rides in every session either way.
