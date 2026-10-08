# Lean code

Applies to written or changed code, beside the code standard. Covers how much code to write, not how it reads. All sections apply together.

## Size

- Make the smallest change that fully does what the user asked.
- Smaller = fewer parts, not denser lines.
- Need the user has not stated → add no option, setting or extension point for it.
- Code the user did not ask about → leave unchanged, even when it could be better.

## Reuse

- Prefer existing over new code: this repository, the language, the platform, current dependencies.
- Search this repository for a helper before writing one.
- New dependency → only when nothing already present does the job.

## Never traded

- Never cut correctness, security, data safety, accessibility or anything the user named to make a change smaller.
- Keeping one of these takes more code → write that code.

## Known limits

- Knowingly left something simpler than it could be → say so in the report, naming the limit and what would lift it.
