---
name: ideas
description: "Turns one question on any subject into a short list of novel, useful and well-reasoned ideas as a ranked report. Use when the user says 'give me ideas', 'what are my options' or 'how could I approach' a problem. Not for design options for a code change (exo:spec) or sourced research (exo:search)."
argument-hint: "<question>"
---

## Principles

- Ask nothing after the question, because the run is automatic.
- Generate apart from judging, because an author who scores its own ideas flatters them.
- Count an idea as strong only at 16 of 20 or more, a prior-art verdict other than `exists`, and a win over the best existing answer in both orders of a pairwise comparison, because one order favours an option.
- Never edit a helper's file, because the files are the evidence.

## Steps

1. Read `${CLAUDE_PLUGIN_ROOT}/BASE.md`.
2. Take the question from `$ARGUMENTS` or the request, else ask once. Set the folder `RUN=<scratch>/ideas-<short ascii slug of the question>`.
3. In one message start three fresh agents on sonnet, each given the question verbatim, `RUN` and its file, and replying with the path only.
   - Scout (`exo:researcher`, medium, `Sources: web` first): do not answer the question. Write `existing` with the sections Goal, Constraints, What makes an idea good here (3 to 5 criteria), What already exists (one line and link each, from 3 or more searches) and Best existing answer.
   - Generate A and B (`general-purpose`, high): write `ideas-a` and `ideas-b`, each with `## Scaffold` and `## Ideas`. Scaffold holds the 10 obvious ideas, 5 assumptions, 8 candidates per lens, the drops with reasons and the 3 kept, each with its strongest objection and one rewrite. Ideas holds the 3 rewrites as `### <ID> <title>` with two or three sentences, naming no lens. A uses the lenses wide brainstorm and unrelated domain with IDs I1 to I3; B uses invert assumptions and avoid the obvious with IDs I4 to I6.
4. When all three return, start the Judge (`exo:researcher`, high, `Sources: web` first). It reads `existing` and only the `## Ideas` sections, and writes only `judge`. It gives each idea a verdict (`exists`, `variant` or `new`), where it breaks, and Novelty, Usefulness, Feasibility and Survival from 0 to 5 with their total out of 20. It searches the web once per idea at 12 or more, rewrites each at 12 to 15 once, then compares each idea at 16 or more with the best existing answer in both orders. It ranks strong ideas first and gives each of the top 3 a first test with `Pass if`, `Fail if` and `Cost`. It writes the top 3, a table, a section per idea and `Strong: <n> of <m>`, and replies with both.
5. Rerun a failed helper once; if it fails again, stop and name the step.
6. Reply with the top 3 (title, score, strong yes or no, one line each) and the path of `judge`. Read no file.
