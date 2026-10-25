# Layout

Layout decides what a person sees first and how far they travel to act, so start from the primary object and the kind of page.

## Apps

- 1440 → the page fits the 1440x900 window like a desktop app: a chrome bar, panes side by side, lists that scroll inside their pane, no document scroll. look.mjs prints `FIT` when the page outgrows the window.
- 390 → a phone app: top bar, a bottom tab bar of 3 or more items that switches views, primary content starting in the top half of the first screen. Desktop panes become tabs or sheets, not one long stack; look.mjs prints `NAV` when the bar is missing.
- 768 → no horizontal scroll; panes collapse in the order a person needs them.
- Chrome → small and quiet: nav labels near body size, desktop controls about 32-36px tall, touch targets about 44px at 390. Big chrome competes with the content it frames.

## Fill the frame

A page reads as blank when a region holds nothing, not when it has space. Squinted at, every region of the first viewport shows content, texture or product detail.

- Panes → every pane fills its height at 1440x900. A rail that ends early gets a second module that belongs there (recent activity, upcoming items, a live stat, a mini chart), not a stretched gap above its footer chip.
- Wide pane with a narrow column → widen the column to the pane, or use the side margins for context (filters, a summary, related items). Two bands of flat ground beside a centred column read as an unfinished page.
- Line length → the 75ch cap applies to body text only, not to the column, the feed or the art.
- Information per viewport → the first screen of an app shows several items of the primary object, not one item below a large empty composer or greeting.

## Documents

- One message per screen, shown through a product artifact rather than copy alone.
- Explicit asks stay high on the page; look.mjs prints `BELOW` for an `--expect` text past 3000px, because readers leave before they get there.

## Hierarchy

- Primary object → the largest type and image on the screen (the game's title and art, the post's text or image, the tracked number).
- Grouping → tight space inside a group, a clearly larger gap between groups, so structure reads without borders; a gap wider than a group's own height reads as empty.
- Rhythm → spacing from a 4/8 scale; one gap for items in a list, a larger one between sections.
- Feed → posts as open bands on the ground with a moderate gap, each image post with full-width art as its largest element, not a thumbnail beside text.
- Asymmetry → a dominant pane or tile beside smaller ones reads as designed; equal columns of equal cards read as a template.

## Density and text

- Lists → enough items to fill the pane plus one scroll, so the pane reads as a real, used product; variety still comes from the items' art.
- Long names and numbers → truncate with an ellipsis or wrap cleanly; look.mjs prints `CLIP` and `OVERLAP` when text collides.
- Empty, error and first-use states → an illustration area in the world's terms, a 16-18px headline, one muted line and one action, not a blank pane or a lone grey sentence.

## Patterns to replace

- Three identical icon cards in a row → one feature shown large with its real content.
- A hero of one big metric with three small numbers → the primary object itself, with metrics beside it at text size.
- Every section on the same white card with a soft shadow → open bands on the ground, cards only for real objects.
- Nested cards, or a card with a colored left border → one surface level, color carried by the item's own fill.
