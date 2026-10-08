# Icons and Imagery

Show the product's real content; do not decorate around it. The enemy is the transferable asset: the 24×24 round-cap icon set every product now wears, the blob-people illustration, the stock photograph that fits any competitor unchanged. The overcorrection is a bespoke mark nobody recognises, or an image so ambitious it arrives after the reader left.

Split: the `visual-direction` reference decides whether a region gets an image and its job; this file decides how the mark or picture is built and what the render must prove.

## The icon system is derived, not adopted

Outside the default stack of the `stack` reference (set: lucide-react), a named set is a geometry reference, never a house style. Derive grid and stroke from what the design already has (body face's stem weight, border token, control radius), enforce one system everywhere, prove it in the render. Geometry per Lucide's design guide, 24px grid:

- One canvas per surface: 24×24 in that system, **one `viewBox` family**, never two grids side by side.
- Verify: collect `viewBox` off every `svg` in the render; more than one grid family → defect.
- One stroke weight, **centered on the path** (2px at 24).
- Verify: read `stroke-width` and its computed value.
- **Effective stroke is a render property**: a 24/2 icon drawn at 16px renders a 1.33px stroke.
- Verify `strokeWidth × renderedWidth / viewBoxWidth` per icon: constant inside a size tier, at least 1px at DPR 1.
- Not constant → the small size gets its own optical variant, not a scale transform.
- At least **1 unit of padding** between any stroke and the canvas edge; at least **2 units between distinct elements**.
- Verify: render at the smallest used size; merged strokes show as blobs against a blurred copy.
- **2-unit corner radius** for shapes at least 8 units wide or tall; **2.41 units** (1 + √2) where diagonals meet at a right angle.
- Coordinates, arc centers and endpoints align to the pixel grid.
- **Never strip the `viewBox`**: keep SVGO's `removeViewBox` off, or the icon stops scaling and may clip.

- Generic icons (close, search, chevron) → may come from one consistent set.
- Display or symbol exception → open where the direction names it.
- Mark carrying the subject or brand → drawn against the subject's own grid, not a set's.
- Decorative icon beside a text label → `aria-hidden`.
- Icon-only control → owes the accessible name and its labelled sibling's optical mass (the `controls` reference).

## Responsive images

- **`sizes` is measured from this layout**, never copied: each clause equals the element's real column width at that breakpoint.
- Missing `sizes` → browser assumes `100vw` and overfetches.
- Verify: intrinsic width of `img.currentSrc` against `getBoundingClientRect().width × devicePixelRatio`; ratio above roughly 1.5 → `sizes` string wrong.
- Resolution switching → `srcset` with `w` descriptors plus `sizes`.
- `<picture media>` → art direction only (changed crop or subject).
- Using `media` → no media conditions inside `sizes`.
- Always a real `<img>` with `src` and `alt` before `</picture>`, or nothing renders.
- Verify: `img.currentSrc` differs across two widths, and the difference is a different crop, not a different scale.
- Intrinsic dimensions (`width` and `height`, or `aspect-ratio`) reserve the space; they do not set the rendered size.
- **LCP image loads eager; every other image takes `loading="lazy"`.**
- Layout-shift and eager-loading measurements → the `performance-budget` reference.

## Cropping, placeholders, and alt

- **Decorative image → empty `alt=""`**, never a missing attribute.
- Informative image → alt describes the information.
- Functional image inside a link or button → yields the action's accessible name.
- Verify: every `img` has the attribute present; the accessibility tree gives functional images a non-empty name.
- **Focal point is evidence, not a default**: `object-fit` with an `object-position` chosen from the subject's own composition.
- Verify: a wall of `50% 50%` across portrait crops → nobody looked at the images.
- Placeholder → chosen from measured latency, not habit: none, dominant-colour fill, blur, or a skeleton matching the final geometry.
- Blur payload → small; a large `blurDataURL` hurts performance.
- A universal grey blur-up is itself a template.

## Illustration and photography

- Imagery → depicts the product's actual screens, environment or output, never a prop drawn from the subject as decoration.
- Stock picture that would fit a competitor unchanged → replace it up the ladder in the `implementation` reference, not delete it.
- Generated illustration filling a region, stock isometric scenes → transferable; a labelled placeholder plus a request for the real material beats both.
- Exception: friendly and playful mood with an image generator in the session, under `## Mood to look` of the `phase-direction` reference.

## Charts as visual material

Where a chart quietly puts on a library's identity; a general surface still owes these:

- **Library's default palette = library's identity.** Vega-Lite defaults nominal fields to `tableau10` and quantitative rect marks to viridis.
- Verify: extract rendered series fills, compare against those sets; a match → the product's palette never reached the chart.
- **Zero baseline is conditional.** `zero` defaults to true for unbinned quantitative x/y: right for bar and area length encodings, often wrong for line and point; decide it, do not inherit it.
- Scale type follows data type: band for bar, rect and rule; point for the rest.
- Domains nice, not raw: round tick labels, not `3.7143`.
- **Category colour survives greyscale.**
- Verify: desaturate the chart screenshot, check luminance separation between adjacent series; failing that → a second channel (direct labels, pattern, shape) is required.

## Judgment

- Rendered measurement outranks declared intent: `currentSrc`, computed stroke and the accessibility tree decide, not the markup's ambition.
- Recognition outranks originality on generic affordances; subject specificity outranks a consistent set on brand and domain marks.
- Alt semantics and reserved space outrank every visual refinement to an image.
- Existing repository icon sets, image pipelines and asset conventions outrank these defaults; extend them rather than adding a parallel system.
