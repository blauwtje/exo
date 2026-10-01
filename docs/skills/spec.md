# spec

Decides what to build, before anything is planned or written.

## When it fires

A request names a result, or brings new wishes for work that already has a brief, an issue or a plan, and leaves a product decision open: what counts as done, which data the outcome stores or shows, which architecture carries it, or what happens in a case the request never mentions. Claude starts it on its own and leaves it alone for a clear goal, a failure or visual-only work.

## Triage before shaping anything

Spec always ends on a brief, even when no decision is open, and never starts `build` on its own. Asked for options instead of a decision, spec lists them, recommends one, and writes nothing. New wishes for work that already has a brief, issue or plan reopen it instead of starting a second one.

## What you get

- Every choice you would notice is asked, never decided for you. A point answerable by running or reading something, spec looks up and records instead of asking; an undecided point stays open no matter what the code shows. A point you would not notice sits in its task.
- Questions come in rounds: one message with every question that can be answered now, each with lettered options and the recommendation on A. Reply `1a 3b` to decide only those, a letter, or `ok` to take every recommendation; the open ones come back in the next round. Questions that wait on an answer come in a later round.
- When nothing is open, spec closes with one to three lines on what was agreed, and the brief follows your yes.
- One brief, stored where the `specs` setting points: a file under `docs/specs/`, a GitHub issue, or both.
- Checks only you can make, such as clicking through a screen or acting in an outside account, go to the brief's short `## Manual checks` list, never into the task list; the run's final report ends with them.
- New wishes reopen the brief you already have and edit it where it stands.
- Once the brief is written and checked, spec ends on one pick: A adjusts the brief, B builds it in this session. Without an answer nothing starts; type `/clear` and then `/exo:build <brief>` to build in a fresh session. Plan mode ends the same way.

## Where its rules live

`skills/spec/SKILL.md`, with reopening a stored brief in `skills/spec/references/stored-brief.md`, the brief's sections in `skills/spec/references/brief.md` and the issue path in `skills/spec/references/brief-in-an-issue.md`.
