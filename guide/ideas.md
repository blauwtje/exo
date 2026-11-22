# ideas

Turns one question on any subject into a ranked top 3 of novel, useful ideas by running a fixed ideation playbook as fresh helper agents.

Warning: a run starts about 14 helpers (about 9 more on a second round) and uses a noticeable part of the subscription limit.

## When it runs

On request: ask for ideas, options or approaches for a problem. The model starts it in your current session. It asks for the question once when you give none, then nothing more.

Not for design options for a code change (`exo:spec`) or sourced research (`exo:search`).

## What you get

- A run folder `~/.ideas/<YYYY-MM-DD>-<slug>/` that keeps every helper's file; run files are never edited. The helpers write under `~/.ideas/`, outside the project, so a permission rule `Edit(~/.ideas/**)` lets them save their files.
- Round 1: one framing helper, three divergent helpers (over-generate, avoid the obvious, unrelated domain) and one revising helper, each giving 5 ideas. The session merges them into one pool of ideas.
- A prior-art check and a score out of 20 for each idea, in batches of 5.
- When no idea scores 14 or more, one more round with new ideas that avoid the 10 lowest-scored directions. There is never a third round.
- A plan with a first test for the top 3, and report.md with the top 3 (score, prior-art verdict, why it could fail, first test) and a table of all ideas.
- The reply lists the top 3 in one line each and the path to report.md. Everything is written in the language of the question.

## Source

skills/ideas/SKILL.md and its prompts in `skills/ideas/references/`.
