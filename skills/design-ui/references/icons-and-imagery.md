# Icons and Imagery

Show the product's real content, do not decorate around it. The enemy is the transferable asset: the 24×24 round-cap icon set every product now wears, the blob-people illustration, the stock photograph that fits any competitor unchanged. The overcorrection is a bespoke mark nobody recognises, or an image so ambitious it arrives after the reader left.

The `visual-direction` reference decides whether a region gets an image and what job it does. This file decides how the mark or the picture is built and what the render must prove.

## The icon system is derived, not adopted

Outside the default stack of the `stack` reference, whose set is lucide-react, a named set is a geometry reference, never a house style. Derive the grid and the stroke from what the design already has (the body face's stem weight, the border token, the control radius), then enforce one system everywhere and prove it in the render. Lucide's design guide gives the geometry at a 24px grid:

- One canvas per surface: 24×24 in that system, and **one `viewBox` family**, never two grids side by side.
- Verify: collect `viewBox` off every `svg` in the render; more than one grid family is a defect.
- One stroke weight, **centered on the path** (2px at 24).
- Verify: read `stroke-width` and its computed value.
- **Effective stroke is a render property**: a 24/2 icon drawn at 16px renders a 1.33px stroke.
- Verify `strokeWidth × renderedWidth / viewBoxWidth` per icon: it is constant inside a size tier and at least 1px at DPR 1.
- When it is not, the small size needs its own optical variant, not a scale transform.
- At least **1 unit of padding** between any stroke and the canvas edge, and at least **2 units between distinct elements**.
- Verify: render at the smallest used size; merged strokes show as blobs against a blurred copy.
- **2-unit corner radius** for shapes at least 8 units wide or tall; **2.41 units** (1 + √2) where diagonals meet at a right angle.
- Coordinates, arc centers, and endpoints align to the pixel grid.
- **Never strip the `viewBox`**: keep SVGO's `removeViewBox` off, or the icon stops scaling and may clip.

Generic icons such as close, search and chevron may come from one consistent set. A display or symbol exception is open where the direction names it. A mark carrying the subject or the brand is drawn against the subject's own grid, because that is where a set stops being a reference and starts being someone else's identity. A decorative icon beside a text label is `aria-hidden`; an icon-only control owes the accessible name and the optical mass of its labelled sibling (the `controls` reference).

## Responsive images

- **`sizes` is measured from this layout**, never copied from an example: each clause equals the element's real column width at that breakpoint.
- A missing `sizes` makes the browser assume `100vw` and overfetch.
- Verify: compare the intrinsic width of `img.currentSrc` against `getBoundingClientRect().width × devicePixelRatio`; above roughly 1.5 the `sizes` string is wrong.
- Resolution switching is `srcset` with `w` descriptors plus `sizes`; the browser picks the first candidate larger than the slot and scales down.
- `<picture media>` is for art direction only, a changed crop or a changed subject.
- Offer no media conditions inside `sizes` when using `media`.
- Always give a real `<img>` with `src` and `alt` before `</picture>`, or nothing renders.
- Verify: `img.currentSrc` differs across two widths, and the difference is a different crop rather than a different scale.
- Intrinsic dimensions (`width` and `height`, or `aspect-ratio`) reserve the space; they do not set the rendered size.
- **The LCP image loads eager; every other image takes `loading="lazy"`.**
- The `performance-budget` reference holds the layout-shift and eager-loading measurements.

## Cropping, placeholders, and alt

- **A decorative image takes an empty `alt=""`**, never a missing attribute.
- An informative image's alt describes the information.
- A functional image inside a link or button yields the action's accessible name.
- Verify: every `img` has the attribute present, and the accessibility tree gives functional images a non-empty name.
- **Focal point is evidence, not a default**: `object-fit` with an `object-position` chosen from the subject's own composition.
- Verify: a wall of `50% 50%` across portrait crops means no one looked at the images.
- Choose the placeholder from measured latency, not from habit: none, a dominant-colour fill, a blur, or a skeleton that matches the final geometry.
- Keep a blur payload small, since a large `blurDataURL` hurts performance.
- A universal grey blur-up is itself a template.

## Illustration and photography

Imagery depicts the product's actual screens, environment, or output, never a prop drawn from the subject as decoration. A stock picture that would fit a competitor unchanged is replaced up the ladder in the `implementation` reference, not deleted. Generated illustration filling a region and stock isometric scenes are transferable by construction; a labelled placeholder plus a request for the real material beats both.

## Charts as visual material

A general surface still owes these, and they are where a chart quietly puts on a library's identity:

- **A library's default palette is the library's identity.** Vega-Lite defaults nominal fields to `tableau10` and quantitative rect marks to viridis.
- Verify: extract the rendered series fills and compare against those sets; a match means the product's own palette never reached the chart.
- **Zero baseline is conditional.** `zero` defaults to true for unbinned quantitative x/y, which is right for bar and area length encodings and often wrong for line and point; decide it, do not inherit it.
- Scale type follows data type: band for bar, rect, and rule; point for the rest.
- Domains are nice, not raw: round tick labels, not `3.7143`.
- **Category colour survives greyscale.**
- Verify: desaturate the chart screenshot and check luminance separation between adjacent series; failing that, a second channel (direct labels, pattern, shape) is required.

## Judgment

- A rendered measurement outranks a declared intent: `currentSrc`, computed stroke, and the accessibility tree decide, not the markup's ambition.
- Recognition outranks originality on generic affordances; subject specificity outranks a consistent set on brand and domain marks.
- Alt semantics and reserved space outrank every visual refinement to an image.
- Existing repository icon sets, image pipelines, and asset conventions outrank these defaults; extend them rather than adding a parallel system.
