# route-skills

The one skill you never have to invoke: the session hook hands its body to every session.

## When it fires

At every session start, resume, clear and compaction. A long session hears the routing part of it again as the transcript grows, because rules read 200,000 tokens ago no longer reach the turn that needs them.

## What you get

- The map of which skill owns which request, and which one wins when two of them fire.
- The right-sizing ladder that runs before every edit adding code, and the floors that are never traded away: trust-boundary checks, failure handling, security, accessibility and anything you asked for by name.
- One shape for how a reply, a report and a question are written, so an answer is a digit rather than a paragraph.
- The settings line, and a pointer to a handoff or a project memory when one exists for your branch.

## Where its rules live

`skills/route-skills/SKILL.md`. `hooks/session-start.sh` injects its body, and `verify/checks/injected-context.mjs` locks the size of what it injects, because that text is the most expensive thing exo owns. The full question format lives in `skills/route-skills/references/question.md` and the next-stage order and model table in `skills/route-skills/references/next-stage.md`; the skills that ask a question or end a stage read them from their reference tables. The `replies` rule rides on the settings line, from `skills/configure/schema.json`.
