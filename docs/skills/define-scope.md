# define-scope

Decides what to build, before anything is planned or written.

## When it fires

A request names a result, or brings new wishes for work that already has a brief, an issue or a plan, and leaves a product decision open: what counts as done, which data the outcome stores or shows, which architecture carries it, or what happens in a case the request never mentions. Claude starts it on its own and leaves it alone for a clear goal, a failure or visual-only work.

## What you get

- An interview in chat, one plain question per message, with two or three options and the recommended one first. Reply with a digit, your own words, or `go` to take every recommended answer.
- Only what you would notice or what is costly to undo is asked; Claude looks facts up in the code and decides routine choices itself.
- A checkpoint listing every decision and who made it: you, the code with its path, or exo. Nothing is written before you say yes.
- One brief, stored where the `specs` setting points: a file under `docs/specs/`, a GitHub issue, or both.
- Checks only you can make, such as clicking through a screen or acting in an outside account, go to the brief's short `## Manual checks` list, never into the task list; the run's final report ends with them.
- New wishes reopen the brief you already have and edit it where it stands.
- A question offering the next stage.

## Where its rules live

`skills/define-scope/SKILL.md`, with reopening a stored brief in `skills/define-scope/references/stored-brief.md`, the brief's sections in `skills/define-scope/references/brief.md` and the issue path in `skills/define-scope/references/brief-in-an-issue.md`.
