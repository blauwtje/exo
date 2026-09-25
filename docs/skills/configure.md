# configure

Shows and changes exo's settings: one at a time, or all of them in one walk.

## When it fires

When you run `/exo:configure`, ask to set up or configure exo, or ask to see or change one setting, for every project, one repository, or this machine only.

## What you get

- With nothing named, a walk through every setting in the chat, one question per message, where keeping what you have is always the first answer and nothing is saved before you confirm the review.
- With a setting named, one question for the value and one for the layer, then the new overview.
- `specs`, `replies` and `context`, the context size in thousands of tokens past which a skill's next phase moves to a fresh context, plus the savings counter, the read guard and its big-file limit.
- The two repository files written for you, one committed so collaborators share it, one git-ignored; a value for every project is named for you to pick in `/config`.

## Where its rules live

`skills/configure/SKILL.md`, with the schema beside it and the walk's steps in `skills/configure/references/setup-map.md`. The harness's own `settings.json`, its permissions and its hooks are not exo's to change.
