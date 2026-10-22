# spec

Decides what to build before any code is written, and writes it down as a brief.

## When it runs

A request leaves a product decision open: what counts as done, which data, which architecture, or a trade-off.

Not for a clear goal, a bug, or visual-only work.

## What you get

- One question at a time, with lettered options and a recommendation. Reply with a letter, or `ok` to take the recommendation.
- Facts it can look up are looked up, not asked.
- After the draft brief, a read-only agent (`exo:find-open-points`, skipped for a plan of at most 3 tasks that all have static proofs) finds every point a wrong guess would change. Points the code settles and cheap-to-undo guesses go under `## Assumptions`. You are asked only the rest, usually 0-3, one at a time; your answers become numbered Decisions, remembered per project.
- A question you leave unanswered stays under `## Open points`, and build refuses the brief until it is answered.
- A brief with a task list, stored where the `specs` setting says: `docs/specs/`, a GitHub issue, or both.
- Checks only you can make go in the brief's `## Manual checks`.
- New wishes for existing work update the existing brief.
- A closing question: start the build now in the background, or get the lines to start it later. Build never starts before you pick.

Asked only for options, spec lists them, recommends one, and writes nothing.

## Source

`skills/spec/SKILL.md` and its `references/`.
