# Performance

Budget the outcome, never the technique. The enemy is the design that passes by being cheap — a flat page with one system font, no ground, no motion, fast because it is empty. The overcorrection is ambition nobody measured: a grain overlay, three glass layers and a canvas field shipped without one number beside them.

Every threshold below is on a **measured outcome** — how long the largest element takes, how much the layout moves, how long a frame blocks. No effect is banned. An expensive technique ships with a **cost disclosure**: the measured milliseconds and kilobytes it added, and the design job it bought. A technique with a disclosure and passing outcomes is legal; a technique with neither is decoration.

## Outcome thresholds

Core Web Vitals, at the 75th percentile of page loads ([web.dev/articles/vitals](https://web.dev/articles/vitals), updated 2024-10-31):

- **LCP ≤ 2.5s** — the largest element rendered.
- **INP ≤ 200ms** — interaction to next paint.
- **CLS ≤ 0.1** — cumulative layout shift.

A headless harness measures the lab side of all three; it never reproduces a p75 field distribution, so report lab numbers as lab numbers. Time-based numbers taken on an unthrottled desktop CPU are meaningless: throttle CPU 4–6x and emulate the network before quoting LCP, INP, or frame cost. CLS, transfer weight, and layout assertions are valid unthrottled.

## LCP is an art-direction budget

The 2.5s splits roughly TTFB 40%, resource load delay under 10%, load duration 40%, render delay under 10% ([web.dev/articles/optimize-lcp](https://web.dev/articles/optimize-lcp), updated 2025-03-31; the page calls these guidelines, not strict rules). A hero raster therefore gets about **one second** of loading on the target connection, and a ground built from CSS, SVG, or a gradient costs approximately nothing. That is a design fact before it is an engineering one: the ladder in `implementation.md` from repository asset to subject artifact to real data to typographic treatment usually descends in cost as it ascends in specificity.

- Never lazy-load the LCP element. Verify: the element the PerformanceObserver names carries no `loading="lazy"`.
- At most one or two `fetchpriority="high"` images; more makes the signal useless (same page). Verify: count them in the source.
- A hero video or canvas that is the LCP element owes a poster or a first-paint frame that is not blank.

## Layout reservation

Every element above the fold reserves its space before its content arrives ([web.dev/articles/optimize-cls](https://web.dev/articles/optimize-cls), updated 2025-02-07):

- `width` and `height` attributes on images and video, or `aspect-ratio` in CSS.
- Loading states reserve the space their result will occupy (the rule `interaction-qa.md` already states, here with its measurement).
- Shifts within 500ms of a user input are not counted, so a disclosure panel opening on click is not a CLS failure; a font swapping at 900ms is.

Verify: collect `LayoutShift` entries with `hadRecentInput` false and attribute each to a selector.

## Font cost

The skill sources a face through `scripts/font-candidates.mjs`; this is what that face owes once chosen.

- **Metric-matched fallback is the real fix for swap shift.** `size-adjust` scales glyph width and height proportionally, and `ascent-override` is the web font ascent divided by (UPM × size-adjust) ([developer.chrome.com/blog/font-fallbacks](https://developer.chrome.com/blog/font-fallbacks), updated 2023-02-10; the tools named there are Fontaine, Capsize, and the framework font packages). Verify: measure a paragraph's `getBoundingClientRect().height` with the fallback and with the loaded face; the difference is 0px or the fallback is not matched.
- **`font-display` is a choice with a stated block period** ([web.dev/articles/font-best-practices](https://web.dev/articles/font-best-practices), updated 2022-10-04): `swap` blocks 0ms; `fallback` blocks 100ms then swaps for 3s; `optional` blocks 100ms and never swaps. Pick per role: a display face carrying the identity and a body face carrying the reading have different answers.
- **Preload deliberately.** The same page warns that preload as a strategy is used carelessly; preload the face the first screenful actually sets, not every weight.
- **A variable file is not automatically lighter** than the statics it replaces (same page). When only two weights are used, measure both before claiming the win.
- Subset by `unicode-range` to the scripts the audience reads, and keep the language coverage `typography.md` requires.

## Weight

Lighthouse targets total transfer **under 1,600 KiB** and fails a page over **5,000 KiB** ([developer.chrome.com/docs/lighthouse/performance/total-byte-weight](https://developer.chrome.com/docs/lighthouse/performance/total-byte-weight), updated 2019-05-02). Verify: sum `transferSize` over Resource Timing entries and split by `initiatorType`, so the number names which decision spent it. A budget file (`timings`, `resourceSizes`, `resourceCounts`) runs through `lighthouse --budget-path`.

## Effect cost

No first-party numeric budget exists for `backdrop-filter`, blur radius, shadow spread, or canvas motion, so these are measured per design, never rationed by count:

- **Compositor properties are `transform` and `opacity`**; animating `top` or `left` cost 37ms rendering plus 79ms painting in Chrome's own comparison against zero for `transform` ([web.dev/articles/animations-guide](https://web.dev/articles/animations-guide), updated 2020-10-06 — old enough that its silence on `filter` and `clip-path` is not evidence against them). Use `will-change` around the change, not as a page-wide sprinkle.
- **Measure a persistent effect with the Long Animation Frames API**: a LoAF is a rendering update delayed beyond **50ms**, and `blockingDuration` sums the task time over 50ms ([developer.chrome.com/docs/web-platform/long-animation-frames](https://developer.chrome.com/docs/web-platform/long-animation-frames), updated 2024-10-14; Chromium only). Observe `long-animation-frame` while driving hover, click, and scroll; its `scripts[]` attribution names the offending effect.
- **CSS scroll-driven animation runs off the main thread** ([developer.chrome.com/docs/css-ui/scroll-driven-animations](https://developer.chrome.com/docs/css-ui/scroll-driven-animations), updated 2023-05-05; Chrome/Edge 115+, Safari 26+). A scroll effect built on a JS `scroll` handler is the expensive form of the same idea, and `implementation.md` already bans it.
- **A long page uses `content-visibility`** with `contain-intrinsic-size`, which moved one measured render from 232ms to 30ms ([web.dev/articles/content-visibility](https://web.dev/articles/content-visibility), updated 2025-09-23). Without the intrinsic size the scrollbar shifts, which is a CLS regression traded for a paint win.

## Hard failures

These have first-party backing and no design justification. They are defects, not budgets:

- [ ] The LCP element is lazy-loaded.
- [ ] More than two `fetchpriority="high"` images.
- [ ] An above-the-fold element reserves no space, so arrival shifts the layout.
- [ ] A `swap` face with no metric-matched fallback.
- [ ] A persistent animation on a layout or paint property.
- [ ] Total transfer over 5,000 KiB.

## Myths not worth enforcing

`will-change` everywhere (the guide above says the opposite); self-hosting always beating a third-party host (Chrome calls the difference not clear cut); variable fonts always lighter; `translateZ(0)` as a general fix; and any round number — "3 seconds", "50 KB of JavaScript" — that no first-party page states.

## Judgment

- A measured number outranks a technique's reputation, in both directions.
- Outcome thresholds outrank every per-feature rule here; a ban on a technique is never the finding.
- A brief's ambition may exceed a soft budget once the cost disclosure is present and the outcome thresholds still pass under throttling.
- Content, accessibility, and the states in `interaction-qa.md` outrank every budget: the fix for a slow page is never a removed state or an unlabelled control.
- Existing repository budgets, build tooling, and browser targets outrank these defaults.
