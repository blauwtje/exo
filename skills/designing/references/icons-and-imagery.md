# Icons and Imagery

Draw the subject, do not decorate around it. The enemy is the transferable asset: the 24×24 round-cap icon set every product now wears, the blob-people illustration, the stock photograph that fits any competitor unchanged. The overcorrection is a bespoke mark nobody recognises, or an image so ambitious it arrives after the reader left.

`visual-direction.md` decides whether a region gets an image and what job it does. This file decides how the mark or the picture is built and what the render must prove.

## The icon system is derived, not adopted

A named set is a geometry reference, never a house style. Derive the grid and the stroke from what the design already has — the body face's stem weight, the border token, the control radius — then enforce one system everywhere and prove it in the render.

Lucide's design guide is the clearest published statement of that geometry, and its numbers are the shape of the rule at a 24px grid ([lucide.dev/contribute/icon-design-guide](https://lucide.dev/contribute/icon-design-guide), read 2026-09-07; 24,391★):

- One canvas per surface: 24×24 in that system, and **one `viewBox` family**, never two grids side by side. Verify: collect `viewBox` off every `svg` in the render; more than one grid family is a defect.
- One stroke weight, **centered on the path** (2px at 24). Verify: read `stroke-width` and its computed value.
- At least **1 unit of padding** between any stroke and the canvas edge, and at least **2 units between distinct elements**. Verify: render at the smallest used size; merged strokes show as blobs against a blurred copy.
- **2-unit corner radius** for shapes at least 8 units wide or tall; **2.41 units** (1 + √2) where diagonals meet at a right angle.
- Coordinates, arc centers, and endpoints align to the pixel grid.

**Effective stroke is a render property.** A 24/2 icon drawn at 16px renders a 1.33px stroke. Verify `strokeWidth × renderedWidth / viewBoxWidth` per icon: it is constant inside a size tier and at least 1px at DPR 1. When it is not, the small size needs its own optical variant, not a scale transform.

**Never strip the `viewBox`.** SVGO's `removeViewBox` is off by default precisely because "this plugin prevents SVGs from scaling, so they will not fill their parent container, or may clip if the container is too small" ([svgo.dev/docs/plugins/removeViewBox](https://svgo.dev/docs/plugins/removeViewBox/), read 2026-09-07; 22,664★).

Generic affordances — close, search, chevron — may come from one consistent set. A mark carrying the subject or the brand is drawn against the subject's own grid; that is where a set stops being a reference and starts being someone else's identity. A decorative icon beside a text label is `aria-hidden`; an icon-only control still owes the accessible name and the optical mass of its labelled sibling (`controls.md`).

## Responsive images

- **Resolution switching is `srcset` with `w` descriptors plus `sizes`**; the browser picks, choosing the first candidate larger than the slot and scaling down ([MDN Responsive images](https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Responsive_images), read 2026-09-07).
- **`sizes` is measured from this layout, never copied from an example.** Each clause equals the element's real column width at that breakpoint. A missing `sizes` makes the browser assume `100vw` and overfetch ([Next.js Image, v16.3.4, updated 2026-08-25](https://nextjs.org/docs/app/api-reference/components/image)). Verify: compare the intrinsic width of `img.currentSrc` against `getBoundingClientRect().width × devicePixelRatio`; above roughly 1.5 the `sizes` string is wrong.
- **`<picture media>` is for art direction only** — a changed crop or a changed subject. Do not offer media conditions inside `sizes` when using `media`, and always give a real `<img>` with `src` and `alt` before `</picture>` or nothing renders (MDN, same page). Verify: `img.currentSrc` differs across two widths, and the difference is a different crop rather than a different scale.
- **Intrinsic dimensions reserve space.** `width` and `height`, or `aspect-ratio`, infer the ratio the browser holds while loading; they do not set the rendered size (Next.js Image, same page). The CLS mechanics live in `performance-budget.md`.

## Cropping, placeholders, and alt

- **Focal point is evidence, not a default.** `object-fit` with a `object-position` chosen from the subject's own composition. Verify: a wall of `50% 50%` across portrait crops means no one looked at the images.
- **Choose the placeholder from measured latency**, not from habit: none, a dominant-colour fill, a blur, or a skeleton that matches the final geometry. A blur payload stays small — Next.js warns plainly that "a large `blurDataURL` may hurt performance" (same page). Universal grey blur-up is itself a template.
- **The LCP image is eager; everything else is lazy** (`performance-budget.md` holds the failure condition).
- **Alt text branches by role**, down the W3C decision tree ([w3.org/WAI/tutorials/images/decision-tree](https://www.w3.org/WAI/tutorials/images/decision-tree/), read 2026-09-07): informative images describe the information, functional images inside a link or button yield the action's accessible name, and decorative images take an **empty `alt=""`** rather than a missing attribute. Verify: every `img` has the attribute present, and the accessibility tree gives functional images a non-empty name.

## Illustration and photography

Imagery depicts the subject's actual artifacts, environment, or output. The test is the substitution test from `visual-critique.md` applied to the asset alone: if the same picture would fit a competitor unchanged, it fails, and the ladder in `implementation.md` replaces it rather than deleting the region. Generated illustration filling a region and stock isometric scenes are transferable by construction; a labelled placeholder plus a request for the real material beats both.

## Charts as visual material

The `dataviz` skill owns chart design. A general surface still owes these, and they are where a chart quietly puts on a library's identity ([Vega-Lite scale docs](https://vega.github.io/vega-lite/docs/scale.html), read 2026-09-07; 5,477★):

- **Zero baseline is conditional.** `zero` defaults to true for unbinned quantitative x/y, which is right for bar and area length encodings and often wrong for line and point. Decide it; do not inherit it.
- **Scale type follows data type** — band for bar, rect, and rule; point for the rest.
- **Domains are nice, not raw**: round tick labels, not `3.7143`.
- **A library's default palette is the library's identity.** Vega-Lite defaults nominal fields to `tableau10` and quantitative rect marks to viridis. Verify: extract the rendered series fills and compare against those sets; a match means the product's own palette never reached the chart.
- **Category colour survives greyscale.** Verify: desaturate the chart screenshot and check luminance separation between adjacent series; failing that, a second channel — direct labels, pattern, shape — is required, not optional.

## Judgment

- A rendered measurement outranks a declared intent: `currentSrc`, computed stroke, and the accessibility tree decide, not the markup's ambition.
- Recognition outranks originality on generic affordances; subject specificity outranks a consistent set on brand and domain marks.
- Alt semantics and reserved space outrank every visual refinement to an image.
- Existing repository icon sets, image pipelines, and asset conventions outrank these defaults; extend them rather than adding a parallel system.
- A labelled placeholder and a request for real material outrank a generated stand-in.
