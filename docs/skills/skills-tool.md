# skills-tool

Decides whether a skill earns its words, and fixes its shape when it does not.

## When it fires

A skill or agent is created, changed, or judged too long. It is not for a one-off fix, a habit of a single project, or a limit a check can enforce: a commit, `CLAUDE.md` or the verifier holds those.

## What you get

- The skill written to one shape: a trigger-only description, an opening that names the enemy and the overcorrection, numbered steps that each carry their reason, and a judgment ladder.
- Bulk moved out of the body into `references/`, with the moment to open each one named.
- A run of the same prompt without the skill and with it, so a rule exists only where the run without it failed.
- A green `node verify.mjs`, which enforces the shape rather than describing it.

## Where its rules live

`skills/skills-tool/SKILL.md`, with its `references/` holding the description standard, the wording register, the shape template and the pressure scenarios.
