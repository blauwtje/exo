# Lean code

Applies to written or changed code, beside the code standard. This file: how much code to write, not how it reads. All sections apply together.

## Size

- Make the smallest change that fully does what the user asked.
- Smaller means fewer parts, not denser lines.
- Add no option, setting or extension point for a need the user has not stated.
- Leave code the user did not ask about unchanged, even when it could be better.

## Reuse

- Prefer what already exists over new code: this repository, the language, the platform, current dependencies.
- Search this repository for a helper before writing one.
- Add a new dependency only when nothing already present does the job.

## Never traded

- Never cut correctness, security, data safety, accessibility or anything the user named to make a change smaller.
- When keeping one of these takes more code, write that code.

## Known limits

- When you knowingly leave something simpler than it could be, say so in your report.
- Name the limit and what would lift it.
