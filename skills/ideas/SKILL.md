---
name: ideas
description: "Generates ideas on any question and judges them apart against what already exists. Use when the user says 'give me ideas' or asks for options on a problem. Not for design options on code."
argument-hint: "question"
---

# Ideas

**Generate first, judge apart, and beat what already exists.** An author who scores their own ideas flatters them, and an idea that already exists is not new. So you split the work: a scout maps what exists, two generators write ideas without seeing each other, and a judge who wrote none of them scores the ideas against the best existing answer.

The run is automatic: after the question, ask nothing.

## Run

1. Take the question from `$ARGUMENTS` or the request, else ask once. Set `RUN=<scratch>/ideas-<short ascii slug of the question>`.
2. In one message, start three fresh helpers on Sonnet. Give each the question word for word, `RUN` and its file name; each replies with its path only.
   - **Scout** (`exo:researcher`, medium effort, `Sources: web` first). It does not answer the question. It writes `existing` with Goal, Constraints, What makes an idea good here (3 to 5 criteria), What already exists (one line and a link each, from 3 or more searches) and Best existing answer.
   - **Generators A and B** (`general-purpose`, high effort). Each writes `ideas-a` or `ideas-b` with `## Scaffold` and `## Ideas`. The scaffold holds the 10 obvious ideas, 5 assumptions, 8 candidates per lens, the drops with reasons, and the 3 kept, each with its strongest objection and one rewrite. `## Ideas` holds the 3 rewrites as `### <ID> <title>` with two or three sentences each, and names no lens. A uses the lenses wide brainstorm and unrelated domain, with IDs I1 to I3. B uses invert the assumptions and avoid the obvious, with IDs I4 to I6.
3. When all three return, start the **Judge** (`exo:researcher`, high effort, `Sources: web` first). It reads `existing` and only the `## Ideas` sections, writes only `judge`, and scores as [references/judging.md](references/judging.md) says.
4. Rerun a helper that failed, once. When it fails again, stop and name the step.
5. Reply with the top 3 (title, score, strong or not, one line each) and the path of `judge`. Do not read the helpers' files yourself, and never edit one: they are the evidence.

```text
1. Price by the hour of use: 17 of 20, strong.
2. Let teams trade unused hours: 16 of 20, strong.
3. One shared calendar per team: 14 of 20, not strong (a variant of an existing tool).
Judge: <scratch>/ideas-pricing/judge
```

Next: `exo:spec`, when an idea becomes a change.
