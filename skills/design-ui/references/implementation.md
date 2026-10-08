# Implementation

Make the code preserve the design without hiding its structure; platform features make the direction structural, not decorative. The enemy is under-engineering: inline styling, one file owning unrelated regions, the same declaration block copied three times, or JavaScript recreating shipped CSS. The overcorrection is an abstraction with one caller, or a feature used outside the project's browser matrix without a complete fallback.

Tokens live as custom properties in one tokens file that component rules reference instead of raw values, and stylesheets import into the layers `reset, tokens, base, layout, components, utilities` in that order. In a Tailwind project, the theme variables of its main stylesheet are that tokens file and Tailwind's layers replace these.

## Contents

- [One styling mechanism](#one-styling-mechanism)
- [Banned patterns](#banned-patterns)
- [Compatibility gate](#compatibility-gate)
- [Where code lives](#where-code-lives)
- [Tokens and palette derivation](#tokens-and-palette-derivation)
- [Responsive type and layout](#responsive-type-and-layout)
- [Selectors and cascade](#selectors-and-cascade)
- [Enhanced transitions and native controls](#enhanced-transitions-and-native-controls)
- [Economy](#economy)
- [Abstraction and readability](#abstraction-and-readability)
- [Finish — browser surfaces](#finish--browser-surfaces)
- [Replacing decoration](#replacing-decoration)
- [Pre-ship sweep](#pre-ship-sweep)
- [Judgment](#judgment)

## One styling mechanism

- Write the surface's styles the way one already-styled sibling file writes them, and read that file before the first declaration.
- Add no second mechanism beside it (a stylesheet in a utility-class project, utility classes in a modules project, a runtime style library for this surface); two mechanisms render as two spacing and color systems.
- In a Tailwind project, introduce no `@apply` when the repository has none.

## Banned patterns

- Float layout, except text wrapping around an image.
- Pixel-only type scales.
- JavaScript wheel hijacking or scroll steering.
- A scroll library for an effect a supported CSS timeline expresses.
- `transition: all`; name each transitioned property.
- Inline event handlers, such as `onclick=""`.
- Placeholder copy.

## Compatibility gate

Read the project's browser targets before choosing syntax, and follow an existing build or transpile policy. A feature outside that matrix sits behind `@supports` or degrades to a complete, usable layout; no enhancement carries required content or the only available action. No target matrix (greenfield work, single-file demo) → assume current evergreen browsers and keep the reduced-motion and degradation paths.

## Where code lives

- **Single-file deliverables** the user asks for (artifacts, single HTML demos) change nothing structurally: one organized `<style>` block in `<head>` *is* the stylesheet. With no imports to carry the layers, declare `@layer reset, tokens, base, layout, components, utilities` once at the top and define the tokens in one `:root` block.
- Mirror the layer order in stylesheet order, and let component rules follow page order, so the stylesheet reads top-to-bottom like the page.
- Behavior lives in script files, or one `<script>` block in single-file mode.
- Wire events with `addEventListener` or the framework's idiom.

## Tokens and palette derivation

Use `oklch()` for authored colors when the target matrix supports it, and derive related colors with `color-mix()` or relative color syntax, not unrelated literals: `--tint: color-mix(in oklch, var(--accent) 12%, var(--ground))`.

Build the role tokens the interface actually has:

- `--ground` and `--surface` for the page and raised planes.
- `--ink` and `--ink-muted` for text, plus one inverse role only where text sits on a filled surface.
- `--border`, derived and never hand-picked.
- `--accent`, `--accent-hover`, and `--tint`.
- A state color per state the interface can enter.

- Beyond the seeds, derive by default: fifteen values read as one family without forcing every value onto one ramp.
- Derive each state color's companions, a `-tint` background and a text-safe cut, exactly as for the accent.
- **Fork the dark scheme in one place.** `color-scheme: light dark` on `:root`, every forked token declared once with `light-dark()`. Component rules never mention a scheme; a component that knows about dark mode means the tokens failed.
- Borders and one-pixel device alignments are the only raw pixel values inside component rules.

## Responsive type and layout

- Define fluid type tokens with `clamp()`: 360px for the minimum, 1280-1440px for the maximum.
- Use container queries for components reused in more than one layout; use media queries for viewport-wide composition changes.
- Use grid or flex for layout, and subgrid when child rows must align across siblings.
- Use logical properties for flow-relative spacing and inset; use physical properties only for a screen-anchored edge.
- Use `aspect-ratio`, `gap`, `place-*`, and `inset` instead of padding-ratio, child-margin, or four-offset workarounds.
- Pad every screen-anchored edge with `env(safe-area-inset-*)` added to its own spacing token, not instead of it.
- Mobile text input → 16px or larger, or iOS Safari zooms the viewport on focus; a mechanic, not the reading floor the Phase 3 body-text rule sets.

## Selectors and cascade

- Use `:has()` when parent or sibling state already exists in the DOM; do not add JavaScript only to mirror that state.
- Nest selectors at most three levels.
- Outside a utility-class project, keep one class per element as the default. Resolve overrides through layer order, not selector weight or `!important`.
- Use `text-wrap: balance` for short headings and `text-wrap: pretty` for prose when the target matrix supports them.

## Enhanced transitions and native controls

Read the `motion` sections the skill's References row names before adding motion. Scroll timelines, view transitions, and `@starting-style` are enhancements: guard them for the target matrix, keep final content visible without them, and provide the reduced-motion path. Both states stay usable without the view transition.

Prefer semantic HTML, shipped controls (`dialog`, `popover`, `details`, native form states) or the project kit's primitives over div-plus-ARIA reconstructions. Style their focus, open/closed, invalid, and disabled states; native does not mean unstyled.

## Economy

Fewer statements for the same behavior.

- **CSS before script:** `:has()`, scroll-driven animations, `@starting-style`, and scroll-state queries replace the JavaScript that used to mirror state.
- **Markup is lean.** No wrapper div whose only job is holding a class the semantic element underneath could carry. No class on an element that no rule selects.
- **Modern shorthand is the default idiom**: `inset` over four offsets, `place-items`/`place-content`, `margin-block`/`padding-inline`, `gap` instead of per-child margins, `aspect-ratio` instead of padding hacks.

## Abstraction and readability

- Prefer parameterizing what exists (props, custom properties, a modifier class) over creating a near-duplicate sibling; one primitive may carry several visual expressions that way.
- Authored class names describe role, not appearance: `.card-price`, not `.text-blue-bold`.

## Finish — browser surfaces

Theme every browser surface the page shows:

- `::selection` in palette colors;
- `accent-color` and `caret-color` on form controls;
- `scrollbar-color` on any panel that scrolls inside the layout;
- links with a chosen `text-underline-offset` and `text-decoration-thickness`;
- `font-variant-numeric: tabular-nums` in columns whose numbers change (the `typography` reference).

## Replacing decoration

When a critique tell removes decoration, climb this ladder rather than deleting the region:

1. A repository asset.
2. A diagram of real content drawn with SVG, CSS, or canvas, never a hand-drawn chart.
3. Real data as an instrument.
4. A typographic or compositional treatment.
5. Omitting the region, last.

## Pre-ship sweep

Run `scripts/check-ui.mjs` with `--source` and `--url` instead of grepping by hand. It reports:

- the inline-style, inline-handler, `!important`, `transition: all`, placeholder-copy, float-layout, emoji-in-markup, and raw-value tells;
- its own decorative-default tells: gradient text, radial halo, uniform card shadow, left-accent card, overused faces;
- its markup-completeness tells: `svg-without-viewbox`, `image-without-alt`, `image-without-dimensions`, `srcset-without-sizes`, `missing-lang-attribute`;
- `physical-direction-property`;
- computed contrast, target size, overflow, `reflow-two-dimensional` at 320×256, and focus-indicator findings.

Read its one-line stdout summary; the JSON file its `report=` names holds the definite and blocking counts by type under `typeSummary`, and its findings, which you open only for a finding being repaired.

Read each finding's `confidence` before acting, and fix the code rather than the checker.

## Judgment

- Existing repository conventions and browser matrix outrank these defaults and feature novelty.
- Complete content, actions, and reduced-motion behavior outrank enhancement fidelity.
- The shortest form that preserves behavior and project idiom outranks both reuse speculation and line-count reduction.
