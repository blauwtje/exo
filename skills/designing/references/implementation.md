# Implementation

Make the code preserve the design without hiding its structure, using platform features so the direction is structural rather than decorative. The enemy is under-engineering — inline styling, one file owning unrelated regions, the same declaration block copied three times, or JavaScript recreating shipped CSS. The overcorrection is an abstraction with one caller, or a feature used outside the project's browser matrix without a complete fallback.

The global rules already own file placement, the single tokens file, the cascade-layer order, the inline-style ban, reuse before creating, the third-occurrence extraction threshold, dead code, naming, and comments; this file adds only what the design needs from the code and repeats none of them.

## Compatibility gate

Read the project's browser targets before choosing syntax, and follow an existing build or transpile policy. A feature outside that matrix sits behind `@supports` or degrades to a complete, usable layout; no enhancement carries required content or the only available action. With no target matrix — greenfield work or a single-file demo — assume current evergreen browsers and keep the reduced-motion and degradation paths.

## Where code lives

- **Single-file deliverables** (artifacts, single HTML demos) change nothing structurally: one organized `<style>` block in `<head>` *is* the stylesheet. With no imports to carry the layers, declare `@layer reset, tokens, base, layout, components, utilities` once at the top and define the tokens in one `:root` block.
- Mirror the layer order in stylesheet order, and let component rules follow page order, so the stylesheet reads top-to-bottom like the page.
- Behavior lives in script files (or one `<script>` block in single-file mode). No inline `onclick=""` handlers; wire events with `addEventListener` or the framework's idiom.
- In a Tailwind project, do not introduce `@apply` when the repository has none.

## Tokens and palette derivation

Use `oklch()` for authored colors when the target matrix supports it, and derive related colors with `color-mix()` or relative color syntax rather than unrelated literals — `--tint: color-mix(in oklch, var(--accent) 12%, var(--ground))`.

- Build the role tokens the interface actually has: `--ground` and `--surface` for the page and raised planes; `--ink` and `--ink-muted` for text, plus one inverse role only where text sits on a filled surface; `--border`, derived and never hand-picked; `--accent`, `--accent-hover`, and `--tint`; and a state color per state the interface can enter.
- Beyond the seeds, derivation is the default: fifteen values read as one family without forcing every value onto one ramp. Derive each state color's companions — a `-tint` background, a text-safe cut — exactly as for the accent.
- **Fork the dark scheme in one place.** `color-scheme: light dark` on `:root`, every forked token declared once with `light-dark()`. Component rules never mention a scheme — if a component knows about dark mode, the tokens have failed.
- Borders and one-pixel device alignments are the only raw pixel values inside component rules.

## Responsive type and layout

- Define fluid type tokens with `clamp()`: 360px for the minimum, 1280–1440px for the maximum.
- Use container queries for components reused in more than one layout; use media queries for viewport-wide composition changes.
- Use grid or flex for layout, and subgrid when child rows must align across siblings.
- Use logical properties for flow-relative spacing and inset; use physical properties only for a screen-anchored edge.
- Use `aspect-ratio`, `gap`, `place-*`, and `inset` instead of padding-ratio, child-margin, or four-offset workarounds.
- Pad every screen-anchored edge with `env(safe-area-inset-*)` added to its own spacing token, not instead of it: a bottom bar without it sits under the home indicator on a notched phone, and a value hard-coded for one device is wrong on the next.
- Set a mobile text input at 16px or larger. Below that, iOS Safari zooms the viewport on focus and the layout the design was composed for is gone for the rest of the flow; this is a mechanic, not the reading floor the Phase 3 body-text rule sets.

## Selectors and cascade

- Use `:has()` when parent or sibling state already exists in the DOM; do not add JavaScript only to mirror that state.
- Nest selectors at most three levels. Deeper nesting creates specificity coupling.
- Keep one class per element as the default. Resolve overrides through layer order, not selector weight or `!important`.
- Use `text-wrap: balance` for short headings and `text-wrap: pretty` for prose when the target matrix supports them.

## Enhanced transitions and native controls

Read `motion.md` before adding motion. Scroll timelines, view transitions, and `@starting-style` are enhancements: guard them for the target matrix, keep final content visible without them, and provide the reduced-motion path. Both states stay usable without the view transition.

Prefer semantic HTML and shipped controls — `dialog`, `popover`, `details`, native form states — over div-plus-ARIA reconstructions. Style their focus, open/closed, invalid, and disabled states; native does not mean unstyled.

## Economy — fewer statements for the same behavior

- **CSS before script:** `:has()`, scroll-driven animations, `@starting-style`, and scroll-state queries replace the JavaScript that used to mirror state.
- **Markup is lean.** No wrapper div whose only job is holding a class the semantic element underneath could carry. No class on an element that no rule selects.
- **Modern shorthand is the default idiom**: `inset` over four offsets, `place-items`/`place-content`, `margin-block`/`padding-inline`, `gap` instead of per-child margins, `aspect-ratio` instead of padding hacks.

## Abstraction and readability

- Prefer parameterizing what exists — props, custom properties, a modifier class — over creating a near-duplicate sibling; one primitive may carry several visual expressions that way.
- Names describe role, not appearance: `.card-price`, not `.text-blue-bold`.

## Finish — browser surfaces

Theme every browser surface the implementation presents; the cheapest signal a page was built rather than assembled: `::selection` colored from the palette; `:focus-visible` rings recolored and offset in the direction's accent, never the browser default; `caret-color` and `accent-color` in forms; `scrollbar-color` on panels that scroll inside the layout; link `text-decoration-thickness` and `text-underline-offset` set deliberately; and `font-variant-numeric: tabular-nums` in changing columns (`typography.md`).

## Replacing decoration

When a critique tell removes decoration, climb the ladder rather than deleting the region: a repository asset, then a subject artifact drawn with SVG, CSS, or canvas, then real data as an instrument, then a typographic or compositional treatment; omitting the region is last.

## Banned patterns

Float layout, except text wrapping around an image; pixel-only type scales; JavaScript wheel hijacking or scroll steering; a scroll library for an effect a supported CSS timeline expresses; `transition: all`, so name each transitioned property; inline event handlers; and placeholder copy.

## Pre-ship sweep

Run `scripts/check-ui.mjs` with `--source` and `--url` instead of grepping by hand: it reports the inline-style, inline-handler, `!important`, `transition: all`, placeholder-copy, float-layout, emoji-in-markup, and raw-value tells, its own decorative-default tells (gradient text, radial halo, uniform card shadow, left-accent card, overused faces), its markup-completeness tells (`svg-without-viewbox`, `image-without-alt`, `image-without-dimensions`, `srcset-without-sizes`, `missing-lang-attribute`) and `physical-direction-property`, plus computed contrast, target size, overflow, `reflow-two-dimensional` at 320×256, and focus-indicator findings. Read each finding's `confidence` before acting, and fix the code rather than the checker.

## Judgment

- Existing repository conventions and browser matrix outrank these defaults and feature novelty.
- Complete content, actions, and reduced-motion behavior outrank enhancement fidelity.
- The shortest form that preserves behavior and project idiom outranks both reuse speculation and line-count reduction.
