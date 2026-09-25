# define-scope

Decides what to build, before anything is planned or written.

## When it fires

A request names a result, or brings new wishes for work that already has a brief, an issue or a plan, and leaves a product decision open: what counts as done, which data the outcome stores or shows, which of several architectures carries it, or what happens in a case the request never mentions. Claude starts it on its own when it sees one of those, and leaves it alone for a clear goal, a named change, a failure or a two-file edit.

## What you get

- One brief, stored where the `specs` setting points: a file under `docs/specs/`, a GitHub issue marked as shaped, or both.
- Every decision closed in writing, each with who closed it: you, the code with the path that settles it, or exo for a routine one.
- An interview that runs from a map of every open decision and what it waits on: one plain question per message, with how many are still open, until the map is empty or you say go. Nothing closes on a guess.
- New wishes reopen the brief you already have: only the decisions they touch are asked again, and the issue or the file is edited where it stands.
- With the `interview` setting on `page`, the questions appear in one browser tab that shows every decision, open and closed, and a click answers.
- A list of what the change will not do, so the next stage cannot widen it quietly.
- A question offering draft-plan as the next stage.

## Where its rules live

`skills/define-scope/SKILL.md`, with reopening a stored brief in `skills/define-scope/references/stored-brief.md`, the brief's sections in `skills/define-scope/references/brief.md`, the issue path in `skills/define-scope/references/brief-in-an-issue.md`, the page's protocol in `skills/define-scope/references/interview-page.md` and its script in `skills/define-scope/scripts/`.
