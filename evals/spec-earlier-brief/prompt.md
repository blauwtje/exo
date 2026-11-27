---
max_turns: 40
tags: [tune]
allowed_tools: [Read, Glob, Grep, Skill, Bash, Edit, Write, Task, Agent]
---

I run the little shelf lending app in this folder and want late fees added. Plan it for me, don't build anything yet, and I won't be around to answer questions, so take sensible defaults for anything I don't mention.

What I want, all decided:
- A fee is 25 cents per late day, starting after a 2 day grace period, capped at 8 euros per loan.
- Fees apply to open loans (counted up to today) and to loans returned late (counted up to the return date).
- A new `fees` command lists each member with a fee, with the total per member.
- A `fees-export` command writes the fee lines to a file for the bookkeeper, one line per loan with a fee, with the member, the title, the days late and the fee.
- The `overdue` command also shows each loan's fee.
- A member whose open fees are over 10 euros in total is flagged as blocked from borrowing in the `fees` output.

Write the plan so someone can build it later without asking me anything.
