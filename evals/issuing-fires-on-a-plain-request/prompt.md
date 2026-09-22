---
name: issuing-fires-on-a-plain-request
runs: 5
max_turns: 10
timeout_seconds: 300
allowed_tools:
  - Skill(exo:issuing)
  - Read(*/skills/issuing/references/*)
---

This session holds no checkout, no write tool and no `gh`: your answer is the exact commands you run, in order, and the exact final message, not a request for the files. Load every skill you follow through the Skill tool before you answer, because naming a skill is not following it.

Repository `fleet-ops` on GitHub, Python with FastAPI. It defines the labels `type: bug` and `size: S`, no issue types, no milestones and no project. The user writes:

"File an issue for this: the vehicle CSV export is missing the `vehicle_id` column, so customers cannot reconcile rows against their own systems."
