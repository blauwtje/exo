# settings

Shows and changes an exo setting, at the layer you choose.

## When it fires

When you ask to see or change an exo setting, for every project, for one repository, or for this machine only.

## What you get

- Every value with the layer it came from: this machine, the repository, the plugin's global options, then the default.
- The two repository files written for you, one committed so collaborators share it, one git-ignored.
- `specs`, which decides where shaping stores a brief, and `replies`, which decides how replies are written.

## Where its rules live

`skills/settings/SKILL.md`, with the schema beside it. The harness's own `settings.json`, its permissions and its hooks are not exo's to change, and the savings switch belongs to savings.
