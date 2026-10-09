# spec

Decides what to build before any code is written, and writes it down as a brief.

## When it runs

A request leaves a product decision open: what counts as done, which data, which architecture, or a trade-off.

Not for a clear goal, a bug, or visual-only work.

## What you get

- One question at a time, with lettered options and a recommendation. Reply with a letter, or `ok` to take the recommendation.
- Facts it can look up are looked up, not asked.
- A brief with a task list, stored where the `specs` setting says: `docs/specs/`, a GitHub issue, or both.
- Checks only you can make go in the brief's `## Manual checks`.
- New wishes for existing work update the existing brief.
- A last question: build it here (recommended; builds, checks and merges in this chat with `--land`), build it in a fresh session, or change the brief.

Asked only for options, spec lists them, recommends one, and writes nothing.

## Source

`skills/spec/SKILL.md` and its `references/`.
