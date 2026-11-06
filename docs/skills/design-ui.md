# design-ui

Designs how a page or component looks.

## When it runs

- A page, component, or its type, color, spacing, motion or copy changes.
- You call a screen empty, boring or generic.

If the data or behavior of a new screen is still open, `spec` decides that first.

## What you get

- The real page built straight away, with no question unless the request cannot be built without one.
- A visual direction drawn from your audience's own world, stated before any code, unless you or the repo already name one.
- Imagery drawn per item, a display face paired with a text face, one dominant color with a sharp accent.
- A page that fills its frame: every pane and band holds content, texture or product detail, and marketing pages show the product working with real-looking data.
- Motion, reduced motion and every state (hover, focus, disabled, loading, empty, error) drawn as part of done.
- With a screenshot, recording or URL as reference, the result is shown beside it with a difference note and a numbered list of regions, each mapped to its component file by `scripts/regions.mjs`, so "region 3 tighter" edits only that file. One layout variant by default; a second only on request.
- Checks at 1440, 768 and 390 px wide plus screenshots of each state, then a critique by a fresh reviewer, who also names empty regions, and one fix round.
- Accessibility and contrast minimums, never traded for looks.

## Source

`skills/design-ui/SKILL.md` and its `references/`.
