# Motion

Motion clarifies state or guides attention; it never only decorates.

## Tokens

- Define `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)` and `--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1)`; no linear, no ease-in for UI.
- Durations → press and hover feedback 100-150ms; state change, menu, tooltip 150-250ms; panel or modal 250-400ms; one hero entrance up to 700ms.
- Animate `transform` and `opacity` only; never width, height, top or left. Chart or number reveals → `stroke-dashoffset`, `transform: scaleY`, or a rAF counter.

## Required

- Entrance → hero and each section reveal on load or scroll (IntersectionObserver, once): rise 16-32px plus fade, children staggered 60-90ms, at most 8 staggered items. Hide content only after the observer exists and only below the first viewport; add `.in` on load to anything already in view, so a full-page screenshot without scrolling shows every section.
- Signature moment → exactly one authored motion tied to the direction: line chart drawing itself, number count-up, headline mask reveal, marquee, step-to-step slide.
- Control feedback → every button, link, card, row and input has hover, `:focus-visible` and `:active` (scale 0.97 or 1px shift) transitions.
- State transitions → tab or step change, sort, filter, validation message, success and loading all animate in (fade or slide, not a jump cut); loading uses a skeleton shimmer or spinner.
- Count → at least 8 distinct elements move across entrance, hover and state changes.
- Looping motion → none except loading indicators and one subtle ambient element, paused on `prefers-reduced-motion`.

## Reduced motion

Always include:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
```

Content stays visible with no motion: reveal elements start visible when JS is absent or the media query matches; JS skips the count-up and shows the final value.

## Check

- Emulate reduced motion once (Playwright `page.emulateMedia({reducedMotion: 'reduce'})`) and confirm nothing is hidden.
- Full-page screenshot → take it with no scrolling and again after scrolling to the bottom; both show all content.
