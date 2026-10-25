---
name: design-ui
description: Use when a page or component's look or copy changes, or it looks empty, boring or generic. Not for a typo, a non-visual change, or a request that leaves data or behavior open (spec).
---

# design-ui

Build the real page straight away, render it, look at it, fix it. The enemy is the generic template look and the question that stalls the work. The overcorrection is effects piled on with no direction: one committed direction, held.

## Brief

- Question → ask only when the request cannot be built without the answer; else decide and note the decision in the report.
- Reading → before any code, write one line: audience, mood, direction (a committed, specific aesthetic such as "warm editorial, ink on cream, one terracotta accent", not "clean modern").
- Requirements → list every explicit ask from the request as a checklist; the brief outranks taste.
- Content → use the subject's own facts, names and numbers; headline passes the swap-the-name test in `references/slop.md`. Open that file before writing copy or choosing colors.
- Stack → use the repo's existing stack and tokens; none exists → plain HTML, CSS and JS, no CDN or network fonts unless the request allows them.
- Restyle → keep all content, links and working behavior; change only presentation.

## Build

- Order → type scale and color tokens as CSS variables first, then layout, then components, then motion.
- Type → pair one display face with one body face (system or local fonts when offline); clear hierarchy of size and weight; body 16-18px, line length at most 75ch.
- Color → one dominant neutral family, one accent used sparingly, text contrast at least 4.5:1 (3:1 for large text and UI borders).
- Layout → one deliberate asymmetry or rule-break; spacing from a 4/8 scale; responsive at 1440, 768 and 390 with no horizontal scroll.
- Motion → part of done, not polish. Open `references/motion.md` before writing any transition or animation.
- States → draw every one that applies: hover, focus-visible, active, disabled, loading, empty, error, success. Open `references/finish.md` for the list and floors.
- Interaction → every control in the request works with real (made-up, realistic) data, not placeholders such as lorem ipsum.

## Preview

- Preview → the real rendered page, not a mock. Serve or open it and screenshot at 1440, 768 and 390, for example `npx playwright screenshot --viewport-size=1440,900 --full-page <url-or-file> /tmp/d-1440.png`.
- Look → open each screenshot with Read and judge the picture, not the code; shoot without scrolling first, and list every contrast failure before pass 1.
- Console → load the page and exercise one interaction; zero errors and zero failed requests.

## Review

- Pass 1 → against the screenshots and `references/finish.md` checklist, list the top three defects by severity: broken, unreadable, generic, then polish; fix them.
- Pass 2 → re-screenshot once, confirm the fixes, fix what remains; no third loop.
- Requirements → tick each checklist line against the page before reporting; a miss is fixed, not noted.

## Report

- Contents → the one-line reading, files changed, screenshot paths, the requirement checklist with pass marks, any decision made in place of a question.
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
