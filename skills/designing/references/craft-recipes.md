# Craft Recipes

Build the selected direction with material the render can show: a ground with light in it, surfaces with edges and depth, type that carries a voice, and one authored moment of motion. The enemy is the assembled page — a flat neutral ground, one grey shadow under every card, a single family at one weight, a fade-up on every section. The overcorrection is stacking every shape below onto one surface until nothing leads.

Each recipe is a shape, not a value: every color, duration, and easing below stands for a token the direction contract fixed, and a shape that no contract field, subject observation, or brief sentence names stays out. Port a shape onto a repository's existing tokens and mixins rather than beside them.

## Ground

**Directional light** — the default for a ground the contract calls solid: one light source, two neighbours of the ground color, under 8° of hue between stops, so it never reads as a gradient background.

~~~css
background: linear-gradient(168deg,
  color-mix(in oklch, var(--ground) 94%, white) 0%,
  var(--ground) 46%,
  color-mix(in oklch, var(--ground) 92%, black) 100%);
~~~

**Mesh field** — when the contract names a gradient field: two or three off-center, low-chroma pools over the ground, none centered, none at full alpha; body text sits on a solid `--surface`, never on a pool.

~~~css
background:
  radial-gradient(60% 50% at 12% 8%, color-mix(in oklch, var(--accent) 35%, transparent), transparent 70%),
  radial-gradient(50% 60% at 88% 22%, color-mix(in oklch, var(--accent-2) 28%, transparent), transparent 72%),
  var(--ground);
~~~

**Grain** — a subject-derived texture (paper, print, film) the contract names; the overlay is a pseudo-element, so the ground stays one declaration and the texture one opacity token, perceptible at 390px and 1440px or removed.

~~~css
.ground::after {
  content: ""; pointer-events: none; position: absolute; inset: 0;
  opacity: var(--grain-opacity); mix-blend-mode: overlay;
  --grain-texture: url("data:image/svg+xml,%3Csvg width='240' height='240' viewBox='0 0 240 240' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='grain'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23grain)'/%3E%3C/svg%3E");
  background-image: var(--grain-texture);
}
~~~

## Surfaces

**Layered tinted shadow** — the soft-ambient-light grammar: three ramped layers tinted from the ink hue, offset downward, and no hairline border on the same surface.

~~~css
box-shadow:
  0 1px 2px -1px oklch(from var(--ink) l c h / 0.18),
  0 4px 10px -3px oklch(from var(--ink) l c h / 0.14),
  0 18px 36px -12px oklch(from var(--ink) l c h / 0.12);
~~~

**Top-edge highlight** — the one-pixel light that makes a raised surface read as material: `box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.14), var(--shadow-raised);`

**Glass** — the layered-translucency grammar, only over real changing content beneath it, with an opaque fallback.

~~~css
.glass { background: color-mix(in oklch, var(--surface) 62%, transparent);
  backdrop-filter: blur(14px) saturate(1.4);
  box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.18); }
@supports not (backdrop-filter: blur(1px)) { .glass { background: var(--surface); } }
~~~

**Gradient edge** — an accent border that keeps the fill opaque and the radius intact.

~~~css
border: 1px solid transparent;
background:
  linear-gradient(var(--surface), var(--surface)) padding-box,
  linear-gradient(140deg, var(--accent), color-mix(in oklch, var(--accent) 30%, transparent)) border-box;
~~~

**Hard offset** — the neobrutalist grammar: `border: 2px solid var(--ink); box-shadow: var(--offset) var(--offset) 0 var(--ink);`, and the pressed state collapses the offset to zero with a matching `translate`.

## Motion

Choreograph motion as a concept decision, not a garnish. The enemy is unowned motion — scattered default effects and the uniform fade-up nobody chose. The overcorrection is mandated choreography, motion added to satisfy a rule rather than a job. Chosen stillness is a decision; unconsidered stillness is a default.

### Motion thesis

For a full or bounded redesign, write the thesis as one sentence before the first animation: the thing that moves, the trigger that moves it, and what that movement says about the subject. Stock moves such as content drifting upward into place, cards rising under the pointer, or sections appearing as they scroll in say nothing about any subject and are not a thesis; take the thesis from Phase 1. Record exactly one motion decision; a new piece records one for itself:

- **a signature sequence**, only where the surface and concept justify one: a narrative moment, a live instrument, or a continuity-critical transition. A staged entrance is one option — focal first, supporting groups staggered, settling fully visible;
- **feedback-only**, where interaction response is the whole motion story;
- **named stillness**, with the reason recorded.

Under all three, transitions on interactive hover, focus, active, and open states are the floor at every size.

### Job gate

Name one primary job per animation; a secondary job only when it changes implementation or critique:

1. **Continuity:** show where an element came from or went.
2. **Feedback:** confirm an action or state change.
3. **Orientation:** direct attention to the element that changed.
4. **Signature:** the one orchestrated sequence tied to the thesis.
5. **Atmosphere:** ambient background movement tied to `visual-direction.md`'s ground — optional, never carrying content, static under reduced motion, paused off-screen, under that file's material and blur limits.

Cut an animation with no listed job. Signature count follows the direction's spatial ambition: a workspace or a document surface earns one at most, while a narrative, spatial, or instrument-led direction may orchestrate several when each is tied to the thesis and none competes with another for the same moment. Record every planned sequence as trigger → target/state → job → timing token → repository mechanism → reduced-motion result → status. Report each **exercised** when driven in a render, **code-reviewed** when only its code path was read against the thesis, **unjudged** when neither; only exercised is motion-verified.

### Materials

Pick the mechanism for what the motion means, never out of habit:

| The motion means | Reach for |
|---|---|
| An element persists across a state or page change | view transitions, FLIP, a shared element |
| Something moves forward in depth or out of focus | blur, `backdrop-filter`, stacked shadows |
| Content is being uncovered | `clip-path`, `mask`, opacity in steps |
| The subject is live or energetic, and its world says so | canvas or generative motion |

Animate `transform` and `opacity` by default; add blur, `clip-path`, `mask` or shadow only where the target devices keep them smooth.

### Timing

| Motion | Duration |
|---|---|
| Response to a press, toggle or hover | 120–200ms |
| A panel, dropdown or card changing state | 200–400ms |
| A signature sequence or an authored focal entrance | 400–800ms |
| The delay between siblings in a stagger | 30–80ms, with the whole sequence inside 800ms |

- A focus indicator appears at once; a transition may animate properties around focus, never the indicator itself.
- Functional motion slows as it lands, with `cubic-bezier(.16, 1, .3, 1)` as the default ease-out; a signature sequence takes its curve from how the subject physically moves, because the default curve there reads as borrowed.
- An exit is shorter than its entry and runs on its own curve, never the entrance played in reverse. Declare the exit on the closed or leaving state itself: the entry keeps the longer duration token and the ease-out, the exit takes a shorter duration token and an ease-in such as `cubic-bezier(.3, 0, .8, .15)`, so the element leaves faster than it arrived and speeds up as it goes. A transition declared once on the base rule runs the same duration and curve both ways, which is the reversed entrance this rule forbids.
- A springy or elastic curve belongs only to a brief whose world truly bounces, and never to a functional control.

~~~css
@media (prefers-reduced-motion: no-preference) {
  .panel { transition: transform var(--dur-panel) var(--ease-out), opacity var(--dur-panel) var(--ease-out); }
  .panel[data-state="closed"] { transition-duration: var(--dur-feedback); transition-timing-function: var(--ease-in); }
}
~~~

Durations and curves live in tokens, and a transition lists its properties instead of `all`.

**Duration derives from distance.** Carbon states the rule the token tables hide: "the larger the change in distance… or size (scaling) of the element, the longer the animation takes" ([carbon-website `elements/motion/overview.mdx`, `main`, read 2026-09-07](https://github.com/carbon-design-system/carbon-website/blob/main/src/pages/elements/motion/overview.mdx)). A panel crossing the viewport and a chip nudging four pixels do not share one token. Verify: measure two travels of clearly different distance and confirm the longer one takes longer.

**Entrance and exit are different curves**, not one curve played backwards; the same file pairs a standard, an entrance, and an exit easing per mode. This is the mechanism behind the exits-are-shorter rule above.

### Continuity contract

Duration and easing tokens do not describe what happens when a person interrupts. These do, and they are the difference between motion that feels like an object and motion that feels like a slideshow:

- **An interrupted animation starts from the current value**, never from the origin and never by snapping to the end. Motion's docs criticise the View Transitions API on exactly this point: interrupting it "snaps the animation to the end before starting the next one. This feels very janky" ([motion.dev/docs/react-layout-animations](https://motion.dev/docs/react-layout-animations), read 2026-09-07). Verify: trigger, re-trigger at about half progress, and sample the next frame — it sits at the mid value, not at either end.
- **Reversal reverses from where it is**, with the remaining distance setting the remaining time. Verify: open then immediately close, and assert total travel is less than the full distance with no jump between consecutive frames.
- **Velocity carries across a handoff.** Physics springs "incorporate the velocity of any existing gestures or animations for natural feedback", while duration-based springs and tweens do not ([motion.dev/docs/react-transitions](https://motion.dev/docs/react-transitions), read 2026-09-07). A gesture that releases into an animation is where this is load-bearing. Verify: per-frame delta stays continuous in sign and magnitude across the release, rather than collapsing to zero and rebuilding.
- **Gesture-driven motion tracks the pointer 1:1** during the drag and releases into momentum in the same direction.
- **Shared-element continuity means one object persists**, not one element fading out while another fades in. Material's transition set chooses by relationship: a persistent element connects the start and end state, related content moves on a shared axis, unrelated content fades through ([m3.material.io/styles/motion/transitions](https://m3.material.io/styles/motion/transitions), undated). Verify: one node spans both states, with no simultaneous crossfade of two boxes.
- **Choreography declares its order.** An entrance sequence names its order and stagger; an exit is not the entrance reversed.

Material's and Carbon's millisecond ladders and cubic-beziers are their visual language, not a contract: take the relationship rules and the distance rule, theme the numbers.

### Scroll and view transitions

Use CSS scroll timelines when the browser matrix supports them and the page stays complete without them. For narrative pages: pin one or two sections at most, scrub tied to real content progression, reveals running once. Parallax moves non-text imagery by at most 10% of scroll distance; a brief demanding more names the cost. Never steer wheel or scroll position.

Use view transitions only for elements persisting across a state or navigation change, naming only those. `@starting-style` plus discrete transitions handle supported dialog, popover, or display-state entry. Final open and closed states work without animation.

### Reduced motion

Put every transition and animation behind `@media (prefers-reduced-motion: no-preference)`, and never the state it leads to. The `:hover` offset, the `:active` press, the open panel and the selected tab are declared outside the query, so under `reduce` each state change still happens, instantly or as an opacity or color change in place of the travel, and no content or feedback is lost. A state change wrapped inside the query deletes feedback and breaks this rule; so does a blanket `* { animation: none; }` under `reduce` that stops a loading shimmer or a keyframed state change instead of replacing it with an opacity change. This covers CSS animations, scroll timelines, view transitions and media that plays by itself.

~~~css
.row:hover .chevron { transform: translateX(2px); }
@media (prefers-reduced-motion: no-preference) {
  .chevron { transition: transform var(--dur-feedback) var(--ease-out); }
}
~~~

A mask or gradient fade that marks an edge, such as the fade at the end of a scrolling rail, is not motion: it stays exactly as it is under `reduce`. Only a mask whose position or size animates stops, and it stops at its final state.

**The media query is the default, not the whole answer.** Where the surface carries a signature sequence, ambient motion, or autoplay, ship an in-product motion setting whose initial value is read from `prefers-reduced-motion` and which the person can then override either way. The operating-system switch is one all-or-nothing choice made far from this product, most people never find it, and someone who wants this surface still but not its parallax has nowhere else to say so. The setting drives the same token or class the media query does, so there is one code path and not two.

**Replace, do not delete.** Apple's evaluation criteria are explicit: "if the motion itself conveys some meaning… don't remove the animation entirely. Instead, consider providing a new animation that avoids motion" — a dissolve, a fade, a color shift ([App Store Connect reduced-motion criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria), read 2026-09-07). The same page names what must be disabled or changed outright: depth simulation, parallax, animated blur, multi-axis and spinning motion, and auto-advancing motion. Verify under `reduce`: the state change still animates on opacity or color while translation, scale, and parallax measure approximately zero.

### Libraries

Prefer the platform; use a repository's existing animation library idiomatically. Adding one is justified for orchestration, physics, or scrubbed timelines CSS cannot express — never for one fade.

### Shapes

**Staged focal entrance** — the signature sequence `### Motion thesis` allows: focal first, supporting groups after, content visible at rest so a failed animation hides nothing.

~~~css
.hero > * { animation: rise var(--dur-focal) var(--ease-out) both; }
.hero > :nth-child(2) { animation-delay: var(--stagger); }
.hero > :nth-child(3) { animation-delay: calc(var(--stagger) * 2); }
@keyframes rise { from { opacity: 0.001; transform: translateY(14px); } }
@media (prefers-reduced-motion: reduce) { .hero > * { animation: fade var(--dur-feedback) linear both; } }
@keyframes fade { from { opacity: 0.001; } }
~~~

## Type

**Voice from one variable family** — display and body from one file, apart on the width or weight axis: `h1 { font-variation-settings: "wdth" 85; font-weight: 750; letter-spacing: -0.02em; text-wrap: balance; }` over body at `font-weight: 400`.

**Prose that breaks well** — `p { text-wrap: pretty; max-inline-size: 65ch; hanging-punctuation: first last; }`, and `font-variant-numeric: tabular-nums` on any changing figure.

## Judgment

- The contract and the job gate in `## Motion` outrank every shape here; a shape with no contract field behind it is decoration.
- Body-text contrast on top of a ground shape outranks the shape.
- One shape per job: two atmosphere layers doing the same job is one too many.
- Existing repository tokens, mixins, and motion primitives outrank these shapes; port the shape onto them.
- Reduced-motion preference and interaction feedback outrank the thesis.
- One authored signature outranks scattered micro-effects.
- A brief's requested intensity outranks these caps; the accessibility floor outranks the brief.
- Existing repository motion tokens and browser targets outrank these values.
