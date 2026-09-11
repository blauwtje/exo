---
name: right-sizing
description: Use when the user asks for the minimal, simplest, lean or YAGNI version, or names bloat, boilerplate or an unneeded dependency, to pick the smallest correct shape that still reads well. Not before every edit while exo savings are on, because the session context already holds the ladder. Not for diagnosis, which debug owns; not for prose, plans, a typo or a rename.
---

# Right-sizing

Build the smallest shape that does the whole job and still reads as one thing per line. The enemy is the component, class or abstraction built for a need nobody has yet. The overcorrection is golfed code: a chained one-liner, a dropped guard, or a skipped read that ships a confident wrong fix.

## When to use

- The user asks for minimal, simplest, lean or YAGNI, or names bloat, boilerplate or an unnecessary dependency.
- Not before every edit while exo savings are on: the session hook puts the ladder and its guards in context, so a call repeats them.
- Not for diagnosis: `debug` proves the cause first; this skill sizes the fix once the cause is proven.
- Not for a one-file typo or rename, prose, or a plan.

## The ladder

Read the ranges the change touches and follow the real flow through them before the first rung: lazy about the solution, never about reading. Then answer each rung from those ranges, in one pass, and stop at the first that holds; when two rungs hold, the earlier one wins without weighing, because weighing rungs is the over-build moved into thinking.

Decide it without asking and edit in the same turn: a question about the shape ends a headless session before any code.

1. **Need.** The request names a present use; a use imagined for later is skipped and named in the report, because unused code is read and maintained by everyone after you.
2. **Present.** A symbol, pattern or type in this repository already does it, found by one search for its name or role: reuse it, because a second copy splits the codebase in two.
3. **Standard library.** The language's standard library does it: call it, because more people have tested it than any file here.
4. **Platform.** A native feature does it, such as a date input over a picker component, CSS over script, or a database constraint over application code: use it, because the platform ships the edge cases.
5. **Installed.** A dependency already in the manifest does it: use it, and add no new one for what ten lines cover.
6. **Minimum.** Write the fewest statements that pass the checks, one thing per line: no chained call into a call into an index, full-word names, a guard clause over nesting.

## Never on the ladder

Trust-boundary validation, error handling that prevents data loss, security, accessibility, and anything the user asked for by name are built in full at whatever rung the code lands on. A corner cut with a known ceiling gets one comment naming the ceiling and the upgrade path, because that constraint is what the next reader needs.

## Report

One line after the code: what was skipped and the trigger to add it. A paragraph defending a simplification is complexity smuggled back as prose.

## Red flags

| Thought | Reality |
|---|---|
| "A small component is cleaner than the native input." | The native input ships keyboard, locale and screen-reader behavior the component would re-implement. |
| "I will add the option now so we do not touch this file again." | The file is touched when the option is needed; until then the option is read by everyone. |
| "One line is always the lean choice." | A chained one-liner hides three steps; three named lines are the minimum that reads. |
| "The ladder needs a survey before I can pick." | Each rung is one search or one read of what discovery already named; a survey is the over-build moved into thinking. |
| "Validation is internal, skip it." | Internal today is a trust boundary after the next caller; the guard stays. |
| "A second check layer keeps the first one honest." | Machinery that only checks other machinery is the over-build in test clothing; one check that fails when the logic breaks is the floor and the ceiling. |

## Judgment

- Reading outranks the ladder: the ladder runs after the ranges the change touches are read, never instead of it.
- A guard the code standard requires outranks a lower rung.
- The earlier rung outranks the shorter diff when both hold.
- Readability at the sixth rung outranks fewer lines: one thing per line, full-word names.
- What the user asked for by name outranks every rung; a concern is one sentence, then the build.
