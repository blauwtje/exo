# Build Pass

Build the one pass from this file, read whole and once; where the `stack` reference, read in Phase 2, picks the default stack, it governs the scaffold, every component, the package per job and the preview url. The enemy is the assembled default page: white ground, grey cards, stock controls, no motion. The overcorrection is stacking every treatment until nothing leads.

## Contents

- [Character](#character)
- [The build floor](#the-build-floor)
- [Slop tropes](#slop-tropes)
- [The motion bar](#the-motion-bar)
- [Finishing controls](#finishing-controls)
- [Proof](#proof)
- [Judgment](#judgment)

## Character

- Give each screen one standout element, because boldness spread across every region reads as none.
- Spend the direction's boldest move on that element; supporting regions stay designed but quieter.
- Tint the ground and every surface from the palette, never pure white or a neutral grey default.
- Never ship white cards on a grey ground with a single accent color, because that kit reads as generated.
- Light a solid ground from one direction: two neighbours of the ground color, under 8° of hue between stops.
- Give raised surfaces the direction's material, such as a tinted layered shadow or a top-edge highlight, not one grey shadow each.
- Give type a voice through a second weight, width or family.

## The build floor

The underdesign floor: the ground is a designed surface, not an untouched flat neutral.

- Span the page background and any sidebar the full page height at 390px and 1440px, or a band of another color shows below.
- Theme every browser surface: `::selection`, `accent-color`, `caret-color`, `scrollbar-color` on inner scrollers, and link underline offset and thickness.
- Set changing figures in `font-variant-numeric: tabular-nums`.
- Use `text-wrap: pretty`, grid and subgrid, `color-mix()`, masks and scroll-driven animation as the idiom, not enhancements to ration.
- Build every content item the plan carries; a region still holding placeholder material leaves the page unfinished.
- Build a technique the content or brief names, such as a canvas or generative motion, working and live, never faked by an image.

The numeric floor:

- no horizontal scroll from 360px through 1440px;
- body text at least 16px, or 14px in dense data UI, with line-height at least 1.5;
- contrast at least 4.5:1 for body text and 3:1 for UI chrome and text at least 24px, or at least 18.66px and bold;
- targets at least 24×24 CSS px, the WCAG 2.2 AA minimum;
- a target is exempt only for sufficient spacing, an equivalent control, inline text, a user-agent default, or an essential presentation;
- 44×44 is the enhanced target and the default under a coarse pointer;
- reduced-motion handling for every animation and semantic HTML beneath styling;
- reflow at 320×256 CSS px with no scrolling in two dimensions, unless the content requires a two-dimensional layout for usage or meaning;
- the largest element loading eagerly, every element above the fold reserving its space, and no persistent animation on a layout or paint property;

## Slop tropes

A trope stays only when the plan or the brief's wording justifies it and the reason is recorded.

`scripts/check-ui.mjs` reports the code-detectable ones:

- `overused-font`, `uniform-card-shadow`, `radial-halo`, `thin-border-wide-shadow`, `edge-accent-card`, `gradient-text`, `transition-all`, `emoji-in-markup`, `aggressive-gradient-ground`, `kicker-above-heading`.
- `purple-palette`, `neon-on-dark`, `cream-ground`, `tinted-glow`, `pill-button`, `bounce-easing`, `card-entrance`, `monospace-label`, `invented-content`.

By category:

- Grounds: no gradient whose hue swings across the page, no saturated central halo or glow, no decorative gradient wash.
- Containers: no colored left border on a rounded box, no cards inside cards, no thin border beneath a broad soft shadow.
- Type: no Roboto, Montserrat or system stack as display face, no small label above a heading, no gradient text, no decorative monospace.
- Kits: not cream with a serif and terracotta, not near-black with one acid accent, not white cards on grey with one blue accent.
- Imagery: no emoji outside a stated brand use and no invented SVG drawing; place a labelled placeholder and ask for the real material.
- Buttons: no arrow glyph added to the label.
- Stock shadcn: no fetched component left in its default form; the radius, tokens, density and variants follow the `stack` reference's `## Theme`.

## The motion bar

- Write the motion thesis as one sentence before the first animation: how the chosen mood moves.
- Build the whole bar on every screen, each item where the scope gives it a home, because rich motion is a level, not a look.
- Stagger regions in from their container, focal region first, content visible at rest so a failed animation hides nothing.
- Count key figures up to their value on first view.
- Move the active mark of tabs, segmented controls and navigation with a sliding indicator.
- Morph a section or view switch with Motion's `AnimatePresence` and `layout` where the project uses Motion, else wrap it in `document.startViewTransition()`, not only `view-transition-name`.
- Slide a detail, filter or edit panel in from its edge, and let it leave faster.
- Transition hover, focus, active and open states at every size, beneath the bar.
- Cut an animation with no job among continuity, feedback, orientation or atmosphere.
- Time press, toggle and hover feedback at 120–200ms, a panel or dropdown at 200–400ms, an entrance or count-up at 400–800ms.
- Space a stagger 30–80ms per sibling, with the whole sequence inside 800ms.
- Ease functional motion out with `cubic-bezier(.16, 1, .3, 1)` or a Motion spring without bounce; overshoot belongs only to a playful mood, never a functional control.
- Declare the exit on the closed state, or in Motion's `exit`, with a shorter duration and an ease-in, because one base-rule transition replays the entrance reversed.
- Animate `transform` and `opacity`, keep durations and curves in tokens, and name each transitioned property, never `all`, Tailwind's `transition-all` in a fetched component included.
- Show a focus indicator at once; never transition the indicator itself.
- Put every CSS transition and animation behind `@media (prefers-reduced-motion: no-preference)`, never the state it leads to.
- Wrap a Motion app in `<MotionConfig reducedMotion="user">`, so Motion drops transform and layout animation under `reduce` while keeping opacity.
- Declare hover offset, press, open panel and selected tab outside that query, so each state change still happens under `reduce`.
- Under `reduce`, replace meaningful motion with a fade or color shift rather than deleting it, so loading and feedback survive.

## Finishing controls

- Style every reachable state of a repeated component: rest, hover, focus-visible, active, disabled, plus invalid and busy where they occur.
- Make each state differ by more than opacity: a surface step, an edge, an elevation or a weight change.
- Draw `focus-visible` as the accent ring at a stated offset, never the browser default and never removed.
- Show why a control is disabled where the reason is knowable, never by cursor alone.
- Make press read as depth in the direction's material: shift the surface, lower elevation or collapse the offset, never a color flicker alone.
- Build three tiers that stay distinguishable with color removed: primary, secondary and destructive.
- Give each region one primary action with the filled surface, heaviest label and largest optical mass.
- Build the secondary on the primary's skeleton: same height, radius and label mechanics, outlined, tinted or ghosted.
- Recut destructive in the direction's state color, never stock red, and never as its only signal.
- Make a tertiary text action a link, not a fourth button style.
- Give accept and decline equal weight where the pair is consent, because a lighter decline engineers refusal into acceptance.
- Size an icon inside a control to the label's cap height, separated by a gap from the spacing scale.
- Tie one radius scale to control height; never mix a 4px input with a 24px button.
- Name the outcome on a control, such as "Save changes", never "Submit", "Go" or "OK" where an outcome exists.
- Reset `appearance` on native select and search fields, drawing the chevron from the icon set with end padding that clears it.
- Center field and select text with equal block padding around a stated line-height, not a fixed height, outside a kit whose fetched fields set their own height.
- Build each reachable loading, empty, error and success state; loading reserves its space so arrival shifts no layout.
- Write an empty state for its reason: first use hands over the first action, a filtered result keeps the query and offers recovery.

## Proof

- When no stage called the skill, run the repository's type-check, lint and tests covering the touched files.
- Run `node <skill dir>/scripts/check-ui.mjs --source <file> --url <url>` once the last edit lands, and read its stdout summary.
- Open the JSON its `report=` names only for a finding being repaired.
- Repair every definite finding, and any `content-clipped` or `element-overlap` finding, before reporting the page finished.
- Report a failure in a file the run did not touch; do not chase it.
- When `build` or `find-cause` called the skill, the proof stays with the caller.

## Judgment

- Explicit brief requirements outrank these defaults.
- Body-text contrast outranks any ground or surface treatment.
- Reduced motion and interaction feedback outrank the motion thesis.
- Existing repository tokens, components and motion conventions outrank these shapes; extend them rather than adding a sibling.
