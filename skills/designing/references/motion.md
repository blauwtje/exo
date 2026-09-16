# Motion

Choreograph motion as a concept decision, not a garnish. The enemy is unowned motion — scattered default effects and the uniform fade-up nobody chose. The overcorrection is mandated choreography, motion added to satisfy a rule rather than a job. Chosen stillness is a decision; unconsidered stillness is a default.

## Motion thesis

For a full or bounded redesign, write the thesis as one sentence before the first animation: the thing that moves, the trigger that moves it, and what that movement says about the subject. Stock moves such as content drifting upward into place, cards rising under the pointer, or sections appearing as they scroll in say nothing about any subject and are not a thesis; take the thesis from Phase 1. Record exactly one motion decision; a new piece records one for itself:

- **a signature sequence**, only where the surface and concept justify one: a narrative moment, a live instrument, or a continuity-critical transition. A staged entrance is one option — focal first, supporting groups staggered, settling fully visible;
- **feedback-only**, where interaction response is the whole motion story;
- **named stillness**, with the reason recorded.

Under all three, transitions on interactive hover, focus, active, and open states are the floor at every size.

## Job gate

Name one primary job per animation; a secondary job only when it changes implementation or critique:

1. **Continuity:** show where an element came from or went.
2. **Feedback:** confirm an action or state change.
3. **Orientation:** direct attention to the element that changed.
4. **Signature:** the one orchestrated sequence tied to the thesis.
5. **Atmosphere:** ambient background movement tied to `visual-direction.md`'s ground — optional, never carrying content, static under reduced motion, paused off-screen, under that file's material and blur limits.

Cut an animation with no listed job. Signature count follows the direction's spatial ambition: a workspace or a document surface earns one at most, while a narrative, spatial, or instrument-led direction may orchestrate several when each is tied to the thesis and none competes with another for the same moment. Record every planned sequence as trigger → target/state → job → timing token → repository mechanism → reduced-motion result → status. Report each **exercised** when driven in a render, **code-reviewed** when only its code path was read against the thesis, **unjudged** when neither; only exercised is motion-verified.

## Materials

Pick the mechanism for what the motion means, never out of habit:

| The motion means | Reach for |
|---|---|
| An element persists across a state or page change | view transitions, FLIP, a shared element |
| Something moves forward in depth or out of focus | blur, `backdrop-filter`, stacked shadows |
| Content is being uncovered | `clip-path`, `mask`, opacity in steps |
| The subject is live or energetic, and its world says so | canvas or generative motion |

Animate `transform` and `opacity` by default; add blur, `clip-path`, `mask` or shadow only where the target devices keep them smooth.

## Timing

| Motion | Duration |
|---|---|
| Response to a press, toggle or hover | 120–200ms |
| A panel, dropdown or card changing state | 200–400ms |
| A signature sequence or an authored focal entrance | 400–800ms |
| The delay between siblings in a stagger | 30–80ms, with the whole sequence inside 800ms |

- A focus indicator appears at once; a transition may animate properties around focus, never the indicator itself.
- An exit is quicker than its entry. Functional motion slows as it lands, with `cubic-bezier(.16, 1, .3, 1)` as the default ease-out; a signature sequence takes its curve from how the subject physically moves, because the default curve there reads as borrowed.
- A springy or elastic curve belongs only to a brief whose world truly bounces, and never to a functional control.

Durations and curves live in tokens, and a transition lists its properties instead of `all`.

**Duration derives from distance.** Carbon states the rule the token tables hide: "the larger the change in distance… or size (scaling) of the element, the longer the animation takes" ([carbon-website `elements/motion/overview.mdx`, `main`, read 2026-09-07](https://github.com/carbon-design-system/carbon-website/blob/main/src/pages/elements/motion/overview.mdx)). A panel crossing the viewport and a chip nudging four pixels do not share one token. Verify: measure two travels of clearly different distance and confirm the longer one takes longer.

**Entrance and exit are different curves**, not one curve played backwards; the same file pairs a standard, an entrance, and an exit easing per mode. This is the mechanism behind the exits-are-shorter rule above.

## Continuity contract

Duration and easing tokens do not describe what happens when a person interrupts. These do, and they are the difference between motion that feels like an object and motion that feels like a slideshow:

- **An interrupted animation starts from the current value**, never from the origin and never by snapping to the end. Motion's docs criticise the View Transitions API on exactly this point: interrupting it "snaps the animation to the end before starting the next one. This feels very janky" ([motion.dev/docs/react-layout-animations](https://motion.dev/docs/react-layout-animations), read 2026-09-07). Verify: trigger, re-trigger at about half progress, and sample the next frame — it sits at the mid value, not at either end.
- **Reversal reverses from where it is**, with the remaining distance setting the remaining time. Verify: open then immediately close, and assert total travel is less than the full distance with no jump between consecutive frames.
- **Velocity carries across a handoff.** Physics springs "incorporate the velocity of any existing gestures or animations for natural feedback", while duration-based springs and tweens do not ([motion.dev/docs/react-transitions](https://motion.dev/docs/react-transitions), read 2026-09-07). A gesture that releases into an animation is where this is load-bearing. Verify: per-frame delta stays continuous in sign and magnitude across the release, rather than collapsing to zero and rebuilding.
- **Gesture-driven motion tracks the pointer 1:1** during the drag and releases into momentum in the same direction.
- **Shared-element continuity means one object persists**, not one element fading out while another fades in. Material's transition set chooses by relationship: a persistent element connects the start and end state, related content moves on a shared axis, unrelated content fades through ([m3.material.io/styles/motion/transitions](https://m3.material.io/styles/motion/transitions), undated). Verify: one node spans both states, with no simultaneous crossfade of two boxes.
- **Choreography declares its order.** An entrance sequence names its order and stagger; an exit is not the entrance reversed.

Material's and Carbon's millisecond ladders and cubic-beziers are their visual language, not a contract: take the relationship rules and the distance rule, theme the numbers.

## Scroll and view transitions

Use CSS scroll timelines when the browser matrix supports them and the page stays complete without them. For narrative pages: pin one or two sections at most, scrub tied to real content progression, reveals running once. Parallax moves non-text imagery by at most 10% of scroll distance; a brief demanding more names the cost. Never steer wheel or scroll position.

Use view transitions only for elements persisting across a state or navigation change, naming only those. `@starting-style` plus discrete transitions handle supported dialog, popover, or display-state entry. Final open and closed states work without animation.

## Reduced motion

Put every movement behind `@media (prefers-reduced-motion: no-preference)`. When the preference is `reduce`, the same state change happens instantly or as an opacity change, and no content or feedback is lost. This covers CSS animations, scroll timelines, view transitions and media that plays by itself.

**The media query is the default, not the whole answer.** Where the surface carries a signature sequence, ambient motion, or autoplay, ship an in-product motion setting whose initial value is read from `prefers-reduced-motion` and which the person can then override either way. The operating-system switch is one all-or-nothing choice made far from this product, most people never find it, and someone who wants this surface still but not its parallax has nowhere else to say so. The setting drives the same token or class the media query does, so there is one code path and not two.

**Replace, do not delete.** Apple's evaluation criteria are explicit: "if the motion itself conveys some meaning… don't remove the animation entirely. Instead, consider providing a new animation that avoids motion" — a dissolve, a fade, a color shift ([App Store Connect reduced-motion criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria), read 2026-09-07). The same page names what must be disabled or changed outright: depth simulation, parallax, animated blur, multi-axis and spinning motion, and auto-advancing motion. Verify under `reduce`: the state change still animates on opacity or color while translation, scale, and parallax measure approximately zero.

## Libraries

Prefer the platform; use a repository's existing animation library idiomatically. Adding one is justified for orchestration, physics, or scrubbed timelines CSS cannot express — never for one fade.

## Judgment

- Reduced-motion preference and interaction feedback outrank the thesis.
- One authored signature outranks scattered micro-effects.
- A brief's requested intensity outranks these caps; the accessibility floor outranks the brief.
- Existing repository motion tokens and browser targets outrank these values.
