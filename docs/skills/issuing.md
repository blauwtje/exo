# issuing

Writes and files GitHub issues for this repository as specs.

## When it fires

Only when you ask to file, open, write or split issues. It leaves the machine, so Claude never starts it.

## What you get

- One issue per scope, in the body shape this repository uses, with the labels, type, relations, milestone and project fields the repository actually defines.
- Nothing invented: a label, type or milestone the repository does not define is left unset and named in the report.
- The same field vocabulary shaping uses when it stores a brief as an issue, read from one file rather than copied.

## Where its rules live

`skills/issuing/SKILL.md`, with the field and body standard in its `references/fields.md`.
