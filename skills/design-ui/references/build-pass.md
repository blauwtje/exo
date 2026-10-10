# Build Pass

Build the one pass from this file, read whole and once; where the `stack` reference (read in Phase 2) picks the default stack, it governs scaffold, every component, package per job and preview url. The enemy is the assembled default page: white ground, grey cards, stock controls, no motion. The overcorrection is stacking every treatment until nothing leads.

## Contents

- [Character](#character)
- [The build floor](#the-build-floor)
- [Slop tropes](#slop-tropes)
- [Finishing controls](#finishing-controls)
- [Proof](#proof)
- [Judgment](#judgment)

## Character

- Each screen → one standout element carrying the direction's boldest move; supporting regions stay designed but quieter.
- Redesign → also fails when supporting regions stay generic while one focal point carries the design, or a large empty area has no content, grouping, pacing, or staging job.
- Ground and every surface → tinted from the palette, not pure white or a neutral grey default.
- White cards on a grey ground with a single accent color → never; that kit reads as generated.
- Solid ground → lit from one direction: two neighbours of the ground color, under 8° of hue between stops.
- Raised surfaces → the direction's material (tinted layered shadow, top-edge highlight), not one grey shadow each.
- Type → a voice through a second weight, width or family.

## The build floor

This floor binds every build, in the session and in every builder; checked before any critique.

The underdesign floor: the ground is a designed surface, not an untouched flat neutral.

- Page background and any sidebar or side rail → span the full page height at 390px and 1440px, full-page captures included; otherwise a band of another color shows below.
- Raised-surface material and type voice → as `## Character` sets.
- Before the first animation → write the motion thesis in one sentence: how the chosen mood moves.
- Motion bar → build every item of `## Motion thesis` in the `motion` reference, held to its `## Job gate`, `## Timing` and `## Reduced motion` sections; open them before the first animation.
- Trope from `## Slop tropes` → stands only with recorded provenance.
- Browser surfaces → theme all: `::selection`, `accent-color`, `caret-color`, `scrollbar-color` on inner scrollers, link underline offset and thickness.
- Amounts and changing figures → body or display family with `font-variant-numeric: tabular-nums`, not a monospace family.
- `text-wrap: pretty`, grid and subgrid, `color-mix()`, masks, scroll-driven animation → the idiom, not enhancements to ration; shapes in the `craft-recipes` reference.
- Every content item the plan carries → built; a region still holding placeholder material leaves the page unfinished.
- Technique the content or brief names (canvas, generative motion) → built working and live, never faked by an image.

The numeric floor:

- no horizontal scroll from 360px through 1440px;
- body text at least 16px, or 14px in dense data UI, with line-height at least 1.5;
- contrast at least 4.5:1 for body text and 3:1 for UI chrome and text at least 24px, or at least 18.66px and bold;
- targets at least 24×24 CSS px, the WCAG 2.2 AA minimum;
- a target is exempt only for sufficient spacing, an equivalent control, inline text, a user-agent default, or an essential presentation;
- 44×44 is the enhanced target and the default under a coarse pointer;
- reduced-motion handling for every animation and semantic HTML beneath styling;
- reflow at 320×256 CSS px with no scrolling in two dimensions, unless the content requires a two-dimensional layout for usage or meaning;
- the largest element loading eagerly, every element above the fold reserving its space, and no persistent animation on a layout or paint property; anything costlier carries the cost disclosure the `performance-budget` reference defines.

## Slop tropes

A trope stays only when a `contract-selected.json` field, the plan or the brief's wording justifies it and the reason is recorded.

- Font or accent swapped after the plan (for a trope, capture fault or critique) → new plan clause naming this user and this product.
- Before the edit applying a swap → rewrite the plan's color and font line to the new pick and drop the old pick's clause; the plan explains what was built.

`scripts/check-ui.mjs` reports the code-detectable ones:

- `overused-font`, `uniform-card-shadow`, `radial-halo`, `thin-border-wide-shadow`, `edge-accent-card`, `gradient-text`, `transition-all`, `emoji-in-markup`, `aggressive-gradient-ground`, `kicker-above-heading`.
- `purple-palette`, `neon-on-dark`, `cream-ground`, `tinted-glow`, `pill-button`, `bounce-easing`, `card-entrance`, `monospace-label`, `invented-content`, `hard-offset-shadow`.

By category:

- Grounds: no hue-swinging page gradient, no saturated central halo or glow, no decorative gradient wash.
- Containers: no colored left border on a rounded box, no cards inside cards.
- Shadows: no same grey shadow under every card, no thin border beneath a broad soft shadow.
- Buttons and cards: no hard opaque offset shadow (solid unblurred block behind the element), unless the user asks for neobrutalism.
- Type: no display face from `scripts/overused-fonts.mjs` or a system stack, no small label above a heading, no gradient text, no decorative monospace.
- Kits: not cream with a serif and terracotta, not near-black with one acid accent, not white cards on grey with one blue or teal accent.
- Accents: no cobalt or other saturated mid blue, unless the prompt or the product asks for blue.
- Imagery: no emoji outside a stated brand use and no invented SVG drawing; place a labelled placeholder and ask for the real material.
- Buttons: no arrow glyph added to the label.
- Charts: no hand-drawn chart where the stack ships a chart component.
- Default stack: no hand-written component the shadcn CLI ships, no shadcn block (`dashboard-01`) as the base.
- Stock shadcn: no fetched component left in default form; radius, tokens, density and variants follow the `stack` reference's `## Theme`.

## Finishing controls

- Repeated component → style every reachable state: rest, hover, focus-visible, active, disabled, plus invalid and busy where they occur.
- Each state → differs by more than opacity: surface step, edge, elevation or weight change.
- `focus-visible` → accent ring at a stated offset, never the browser default, never removed.
- Disabled control → show why where the reason is knowable, not by cursor alone.
- Press → reads as depth in the direction's material (shift surface, lower elevation, collapse offset), not a color flicker alone.
- Tiers → primary, secondary, destructive, distinguishable with color removed.
- Each region → one primary action: filled surface, heaviest label, largest optical mass.
- Secondary → primary's skeleton (same height, radius, label mechanics), outlined, tinted or ghosted.
- Destructive → the direction's state color, not stock red, and never its only signal.
- Tertiary text action → a link, not a fourth button style.
- Consent pair → accept and decline equal weight; a lighter decline engineers refusal into acceptance.
- Icon inside a control → label's cap height, gap from the spacing scale.
- Radius → one scale tied to control height; no 4px input beside a 24px button.
- Control label → names the outcome ("Save changes"), not "Submit", "Go" or "OK" where an outcome exists.
- Native select and search fields → reset `appearance`; chevron from the icon set, end padding clearing it.
- Field and select text → centered by equal block padding around a stated line-height, not a fixed height, except in a kit whose fetched fields set their own height.
- Loading, empty, error, success → build each reachable one; loading reserves its space so arrival shifts no layout.
- Empty state → written for its reason: first use hands over the first action; a filtered result keeps the query and offers recovery.

## Proof

- No stage called the skill → run the repository's type-check, lint and tests covering the touched files.
- Last edit landed → run `node <skill dir>/scripts/check-ui.mjs --source <file> --url <url>` once; read its stdout summary.
- JSON its `report=` names → open only for a finding being repaired.
- One pass → this session starts the preview the `stack` reference names when no url runs, and runs check-ui beside the post-build capture; the builder starts no preview.
- Reachable state (open menu etc.) → check in source, not a capture; the one pass reads only its post-build and final pairs.
- Every definite finding, and any `content-clipped` or `element-overlap` finding → repaired before reporting the page finished.
- Failure in a file the run did not touch → report, do not chase.
- `build` or `find-cause` called the skill → proof stays with the caller.

## Judgment

- Explicit brief requirements outrank these defaults.
- Body-text contrast outranks any ground or surface treatment.
- Existing repository tokens, components and motion conventions outrank these shapes; extend them, add no sibling.
