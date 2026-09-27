# spec

Decides what to build, before anything is planned or written.

## When it fires

A request names a result, or brings new wishes for work that already has a brief, an issue or a plan, and leaves a product decision open: what counts as done, which data the outcome stores or shows, which architecture carries it, or what happens in a case the request never mentions. Claude starts it on its own and leaves it alone for a clear goal, a failure or visual-only work.

## Triage before shaping anything

The first thing spec checks is whether a decision is open at all. A request that settles every open, user-noticeable choice and touches at most two files goes straight to `build`, unasked, with no brief written. A request naming ordered tasks (one needs another done first) still gets a brief, because the order itself is a decision. Asked for options instead of a decision, spec lists them, recommends one, and writes nothing. New wishes for work that already has a brief, issue or plan reopen it instead of starting a second one.

## What you get

- Costly or irreversible points — a data format, a public interface, a paid service, a deletion, access or security — are asked about, always. A point answerable by running something, spec runs it and records the answer instead of asking. Everything routine or cheap-but-visible, spec decides itself and lists as an assumption you can overrule; an undecided point stays open no matter what the code shows.
- An interview in chat, one plain question per message, with two or three options and the recommended one first. Reply with a digit, your own words, or `go` to take every recommended answer.
- A checkpoint listing every decision and who made it: you, the code with its path, or exo. Nothing is written before you say yes.
- One brief, stored where the `specs` setting points: a file under `docs/specs/`, a GitHub issue, or both.
- Checks only you can make, such as clicking through a screen or acting in an outside account, go to the brief's short `## Manual checks` list, never into the task list; the run's final report ends with them.
- New wishes reopen the brief you already have and edit it where it stands.
- Once the brief is written and checked, spec hands it to `build` itself, unasked, in the same turn — no question, no separate step to ask for it. Plan mode is the exception: it ends by asking which stage comes next.

## Where its rules live

`skills/spec/SKILL.md`, with reopening a stored brief in `skills/spec/references/stored-brief.md`, the brief's sections in `skills/spec/references/brief.md` and the issue path in `skills/spec/references/brief-in-an-issue.md`.
