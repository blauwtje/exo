# check-docs

Looks up how the exact version of a library you have installed behaves, instead of guessing.

## When it runs

Only when you type `/exo:check-docs`, for a code decision that depends on an external library, framework, API or service, where a wrong guess would still compile but fail at runtime.

Not for questions this repository's own code answers, or general concepts.

## What you get

- The installed version, read from the lockfile or manifest.
- The answer from that version's official docs, with a URL for each claim.
- What it could not confirm, said plainly.
- The work it was called from continues with the answer.

## Source

`skills/check-docs/SKILL.md`.
