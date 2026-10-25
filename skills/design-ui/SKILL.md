---
name: design-ui
description: Use when a page or component's look or copy changes, or it looks empty, boring or generic. Not for a typo, a non-visual change, or a request that leaves data or behavior open (spec).
---

# design-ui

Build the real page straight away, render it, look at it, fix it. The enemy is the generic template look and the question that stalls the work. The overcorrection is effects piled on with no direction: one committed direction, held.

## Brief

- Question → ask only when the request cannot be built without the answer; else decide and note the decision in the report.
- Reading → before any code, write one line: audience, mood, direction (a committed, specific aesthetic such as "survey-map linework, slate on chalk, one signal-orange route", not "clean modern"); pick none of the AI defaults in `references/slop.md` unless the request asks.
- Signature → in the same line, name one device as "on this page, <a thing from the subject> becomes <a visual device>"; spend it in one place.
- Surface → marketing or landing page commits hard to the direction; tool or dashboard favors precision, density and quiet color; form favors calm and clarity.
- Anchors → before code, map each explicit ask to the section that serves it and one visible text anchor; the brief outranks taste.
- Review window → every explicit ask sits within the first 3000 px at 1440 and at 390: density over sprawl (tighter section rhythm, side-by-side groups, compact FAQ), not cut content.
- Visible asks → every ask shows in the first full-page render without interaction where the design allows.
- Flow or state ask → a multi-step flow shows its step list and the options it asks for; each requested state (empty, error, loading) gets a visible place, such as a real empty panel.
- Content → use the subject's own facts, names and numbers; headline passes the swap-the-name test in `references/slop.md`. Open that file before writing copy or choosing colors.
- Stack → use the repo's existing stack and tokens; none exists → plain HTML, CSS and JS, no CDN or network fonts unless the request allows them.
- Restyle → keep all content, links and working behavior; change only presentation.

## Build

- Order → type scale and color tokens as CSS variables first, then layout, then components, then motion.
- Files → write each file once, then fix with Edit; never rewrite a whole file.
- Type → pair one display face with one body face (system or local fonts when offline); clear hierarchy of size and weight; body 16-18px, line length at most 75ch.
- Color → one dominant neutral family, one accent used sparingly; each text/background token pair carries its computed ratio in a CSS comment, at least 4.5:1 (3:1 for large text and UI borders).
- Small accent text → its own darker token, apart from the accent fill.
- Text fill → solid on every text; no stroke-only or transparent-fill text, outline numerals included.
- Layout → one deliberate asymmetry or rule-break; spacing from a 4/8 scale; responsive at 1440, 768 and 390 with no horizontal scroll.
- Motion → part of done, not polish. Open `references/motion.md` before writing any transition or animation.
- Visible without motion → all content shows in a no-JS render and in one full-page capture.
- Reveal → moves content by `transform`, or plays on load and ends within 400ms; text and its ancestors sit at opacity 1 while waiting for scroll.
- States → draw every one that applies: hover, focus-visible, active, disabled, loading, empty, error, success. Open `references/finish.md` for the list and floors.
- Interaction → every control in the request works with real (made-up, realistic) data, not placeholders such as lorem ipsum.

## Preview

- Look run → after the build, run `node "${CLAUDE_SKILL_DIR}/scripts/look.mjs" <file-or-url> --out <dir>` with one `--expect "<anchor>"` per requirement anchor; write no screenshot script of your own.
- Look output → the lines are the whole check: do not read look.mjs source, use no other browser tool or ad-hoc probe.
- Output → fix every `CONTRAST`, `OVERFLOW`, `CONSOLE`, `MISSING` and `BELOW` line; the `CONTRAST` line decides contrast, not the eye.
- Shots → Read only `<dir>/1440.png` and `<dir>/390.png`; judge the picture, not the code.

## Review

- Pass 1 → against the shots and `references/finish.md` checklist, list the top three defects by severity: broken, unreadable, generic, then polish; fix them with Edit.
- Pass 2 → run look.mjs once more, fix what it still prints; no third loop.
- Requirements → tick each anchor against the page before reporting; a miss is fixed, not noted.

## Report

- Contents → the one-line reading, files changed, shot paths, final `LOOK fail=<n>` line, the anchor checklist with pass marks, any decision made in place of a question.
- Length → under 15 lines; no praise of the result.

## References

| File | Read it when |
|---|---|
| `references/slop.md` | Before writing copy or choosing colors, type or layout. |
| `references/motion.md` | Before any transition or animation. |
| `references/finish.md` | When drawing states and in the review pass. |

## Judgment

- The request's explicit asks outrank taste and the ban lists.
- A missing fact outranks the no-question rule only when the page cannot be built without it.
- Motion and states outrank speed: a page without them is not done.
