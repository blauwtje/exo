# Performance

Budget the outcome, never the technique. The enemy is the design that passes by being cheap: a flat page with one system font, no ground, no motion, fast because it is empty. The overcorrection is ambition nobody measured: a grain overlay, three glass layers and a canvas field shipped without one number beside them.

- Every threshold below = **measured outcome**: time to largest element, layout movement, frame blocking. No effect banned.
- Expensive technique → ships with a **cost disclosure**: measured milliseconds and kilobytes it added, and the design job it bought.
- Disclosure + passing outcomes → legal. Neither → decoration.

## Outcome thresholds

- Before quoting LCP, INP or frame cost → throttle CPU 4–6x and emulate the network; time-based numbers from an unthrottled desktop CPU are meaningless.
- Lab numbers → report as lab numbers; headless harness never reproduces a p75 field distribution.
- CLS, transfer weight, layout assertions → valid unthrottled.

Core Web Vitals, 75th percentile of page loads:

- **LCP ≤ 2.5s**: largest element rendered.
- **INP ≤ 200ms**: interaction to next paint.
- **CLS ≤ 0.1**: cumulative layout shift.

## LCP is an art-direction budget

2.5s splits roughly: TTFB 40%, resource load delay under 10%, load duration 40%, render delay under 10%. Hero raster → about **one second** of loading on the target connection; ground from CSS, SVG or gradient → approximately free. The `implementation` reference's ladder (repository asset → subject artifact → real data → typographic treatment) usually descends in cost as it ascends in specificity.

- Verify the LCP element (the one PerformanceObserver names) carries no `loading="lazy"`.
- `fetchpriority="high"` → at most one or two images; more makes the signal useless. Verify: count them in the source.
- Hero video or canvas as LCP element → owes a poster or non-blank first-paint frame.

## Layout reservation

Every above-the-fold element reserves its space before content arrives:

- `width` and `height` attributes on images and video, or `aspect-ratio` in CSS.
- Shifts within 500ms of user input don't count: disclosure opening on click is not a CLS failure; font swapping at 900ms is.

Verify: collect `LayoutShift` entries with `hadRecentInput` false, attribute each to a selector.

## Font cost

What a face owes once the `typography` reference chose it.

- **Metric-matched fallback = real fix for swap shift.** `size-adjust` scales glyph width and height proportionally; `ascent-override` = web font ascent ÷ (UPM × size-adjust).
- Verify fallback: measure a paragraph's `getBoundingClientRect().height` with fallback and with loaded face; difference 0px, else fallback not matched.
- Preload only the face the first screenful sets, not every weight.
- `font-display` block periods: `swap` 0ms; `fallback` 100ms then swaps for 3s; `optional` 100ms, never swaps.
- `font-display` → pick per role; display face (identity) and body face (reading) differ.
- Variable file not automatically lighter than the statics it replaces; only two weights used → measure both before claiming the win.
- Subset by `unicode-range` to the scripts the audience reads.

## Weight

- Lighthouse: total transfer target **under 1,600 KiB**; fails over **5,000 KiB**.
- Verify: sum `transferSize` over Resource Timing entries, split by `initiatorType`, so the number names which decision spent it.
- Budget file (`timings`, `resourceSizes`, `resourceCounts`) → run via `lighthouse --budget-path`.

## Effect cost

Anything costlier than the build floor → carries the cost disclosure.

No first-party numeric budget exists for `backdrop-filter`, blur radius, shadow spread or canvas motion → measure per design, never ration by count.

- Persistent motion → animate only `transform` and `opacity`.
- `will-change` → around the change, never page-wide.
- Persistent effect → measure with Long Animation Frames API (Chromium only): LoAF = rendering update delayed beyond **50ms**; `blockingDuration` sums task time over 50ms.
- Observe `long-animation-frame` while driving hover, click, scroll; `scripts[]` attribution names the offending effect.
- Scroll effects → CSS scroll-driven animation (off main thread); JS `scroll` handler = the banned expensive form (`implementation` reference).
- Long page → `content-visibility` with `contain-intrinsic-size`; without intrinsic size the scrollbar shifts, a CLS regression traded for a paint win.

## Hard failures

First-party backing, no design justification. Defects, not budgets:

- [ ] The LCP element is lazy-loaded.
- [ ] More than two `fetchpriority="high"` images.
- [ ] An above-the-fold element reserves no space, so arrival shifts the layout.
- [ ] A `swap` face with no metric-matched fallback.
- [ ] A persistent animation on a layout or paint property.
- [ ] Total transfer over 5,000 KiB.

## Myths not worth enforcing

- Self-hosting always beating a third-party host: Chrome calls the difference not clear cut.
- `translateZ(0)` as a general fix.
- Any round number, such as "3 seconds" or "50 KB of JavaScript", no first-party page states.

## Judgment

- Measured number outranks a technique's reputation, both directions.
- Outcome thresholds outrank every per-feature rule here; a ban on a technique is never the finding.
- Brief's ambition may exceed a soft budget once cost disclosure present and outcome thresholds still pass under throttling.
- Content, accessibility, and `interaction-qa` reference states outrank every budget: fix for a slow page is never a removed state or unlabelled control.
- Existing repository budgets, build tooling, browser targets outrank these defaults.
