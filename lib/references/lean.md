# Lean code

Applies to written or changed code, beside the code standard. Covers how much code to write, not how it reads. All sections apply together.

## Size

- Make the smallest change that fully does what the user asked.
- Smaller = fewer parts, not denser lines.
- When the user has not stated a need, add no option, setting or extension point for it.
- Leave code the user did not ask about unchanged, even when it could be better.
- Match the surrounding style; remove only leftovers of your own change and report other dead code.

## Assumptions

- Name your assumptions and, when a task reads two ways, the reading you take; stop and report when it stays unclear.

## Check

- Name the pass-or-fail check before the first edit and work until it passes.

## Reuse

- Prefer existing over new code: this repository, the language, the platform, current dependencies.
- Search this repository for a helper before writing one.
- Add a new dependency only when nothing already present does the job.

## Never traded

- Never cut correctness, security, data safety, accessibility or anything the user named to make a change smaller.
- When keeping one of these takes more code, write that code.

## Known limits

- When you knowingly left something simpler than it could be, say so in the report, naming the limit and what would lift it.
