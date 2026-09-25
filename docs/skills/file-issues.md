# file-issues

Writes and files GitHub issues for this repository as specs.

## When it fires

When you ask in plain words to file, open, write or split issues. The request is the approval: the issues are created and their links reported, with one question only when exo proposes a split you did not ask for.

## What you get

- One issue per scope, in the body shape this repository uses, with the labels, type, relations, milestone and project fields the repository actually defines.
- Nothing invented: a label, type or milestone the repository does not define is left unset and named in the report.
- No existing issue closed, deleted or edited, except a parent or blocker relation you named.

## Where its rules live

`skills/file-issues/SKILL.md`, with the field and body standard in its `references/fields.md`, which define-scope and ship read as well.
