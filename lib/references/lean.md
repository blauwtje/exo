# Lean code

## Size

- Make the smallest change that fully does what the user asked.
- Smaller = fewer parts, not denser lines.
- Add no option, setting, extension point or abstraction for single-use code or an unstated need.
- Leave code the user did not ask about unchanged, even when it could be better.
- Remove only leftovers of your own change and report other dead code.
- Say so when a simpler approach exists.
- For a trivial task, skip the assumption and limit reports; the never-traded list still holds.

## Before and after

- Name your assumptions and, when a task reads two ways, the reading you take; stop and report when it stays unclear.
- Name the pass-or-fail check before the first edit and work until it passes.
- When you knowingly left something simpler than it could be, say so in the report, naming the limit and what would lift it.

## Reuse

- Prefer existing over new code: this repository, the language, the platform, current dependencies.
- Search this repository for a helper before writing one.
- Add a new dependency only when nothing already present does the job.

## Never traded

- Never cut correctness, security, data safety, accessibility or anything the user named to make a change smaller.
- When keeping one of these takes more code, write that code.
