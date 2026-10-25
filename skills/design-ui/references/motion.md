# Motion

Motion explains change: where a view came from, that an item was added, that progress moved. Motion with nothing to explain is noise.

## The load

- One orchestrated entrance → the main regions arrive in a short stagger (chrome, then primary content, then secondary), finished within about 500ms of load.
- Content stays visible without interaction → no reveal gated on scroll position. Scroll-triggered fades leave content blank for readers who jump and in screenshots; look.mjs shoots shortly after load and scroll.
- Entrance → `transform` and `opacity`, starting close to the final state (a small offset or scale), so a missed frame still shows the page.

## State changes

- Hover and press → 100-150ms, ease-out; a press can sink the control by a pixel or deepen its shadow.
- View and tab change → 150-250ms with `transform` and `opacity` only, so layout does not reflow mid-animation.
- Entering → ease-out; leaving → ease-in and shorter than entering.
- Live states → progress bars move, toggles slide, loading placeholders pulse in the direction's colors, a new item slides into its list.
- Bounce and overshoot → only when the world is playful (toys, games); functional UI settles without them.

## Signature motion

One motion tied to the direction, used where it means something: a cartoon press on a toy-like button, a slow light sweep across a lit panel, a page-turn for a print world. One is memorable; five compete.

## Reduced motion

A `@media (prefers-reduced-motion: reduce)` block removes transforms, staggers and loops, and keeps state changes as instant swaps or short fades, so the page stays usable for people motion makes ill.

## Patterns to replace

- Every section fading up on scroll → the staged load above, content visible at rest.
- Floating blobs, drifting gradients, infinite pulses on idle UI → stillness; motion only on change.
- Parallax on a product page → static layers with real depth from light and shadow.
