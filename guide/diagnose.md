# diagnose

Finds why something broke before changing any code.

## When it runs

You report a bug, error, crash, regression or slowdown, such as "why does the export fail" or "this broke".

Not for a missing feature or a failing pull request check.

## What you get

- A command that reproduces the failure, and for a regression the first bad commit.
- One proven cause, the mechanism behind it, and the fix, with a test that failed before it and passes after.
- A handoff file in the temp folder that holds the evidence and proof lines.

## Source

`skills/diagnose/SKILL.md` and its two prompt files.
