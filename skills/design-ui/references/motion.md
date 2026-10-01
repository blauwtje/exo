# Motion

Choreograph motion as a concept decision, not a garnish. The enemy is unowned motion — scattered default effects and the uniform fade-up nobody chose. The overcorrection is mandated choreography, motion added to satisfy a rule rather than a job. Chosen stillness is a decision; unconsidered stillness is a default.

## Reduced motion

- Put every transition and animation behind `@media (prefers-reduced-motion: no-preference)`, and never the state it leads to.
- Declare the `:hover` offset, the `:active` press, the open panel and the selected tab outside the query. Under `reduce` each state change still happens, instantly or as an opacity or color change, and no content or feedback is lost.
- A state change wrapped inside the query deletes feedback, and so does a blanket `* { animation: none; }` under `reduce` that stops a loading shimmer instead of replacing it with an opacity change.
- The rule covers CSS animations, scroll timelines, view transitions and media that plays by itself.

~~~css
.row:hover .chevron { transform: translateX(2px); }
@media (prefers-reduced-motion: no-preference) {
  .chevron { transition: transform var(--dur-feedback) var(--ease-out); }
}
~~~

- **Replace, do not delete.** Where the motion conveys meaning, swap it for an animation that avoids motion, such as a dissolve, a fade or a color shift. Verify under `reduce`: the state change still animates on opacity or color while translation, scale and parallax measure approximately zero.
- Disable or change outright depth simulation, parallax, animated blur, multi-axis and spinning motion, and auto-advancing motion.
- A mask or gradient fade that marks an edge, such as the fade at the end of a scrolling rail, is not motion and stays as it is under `reduce`. Only a mask whose position or size animates stops, and it stops at its final state.
- **The media query is the default, not the whole answer.** Where the surface carries a signature sequence, ambient motion or autoplay, ship an in-product motion setting whose initial value is read from `prefers-reduced-motion` and which the person can override either way. The setting drives the same token or class the media query does, so there is one code path.

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
5. **Atmosphere:** ambient background movement tied to the `visual-direction` reference's ground — optional, never carrying content, static under reduced motion, paused off-screen, under that file's material and blur limits.

- Cut an animation with no listed job. Signature count follows the direction's spatial ambition: a workspace or a document surface earns one at most; a narrative, spatial, or instrument-led direction may orchestrate several when each is tied to the thesis and none competes with another for the same moment.
- Record every planned sequence as trigger → target/state → job → timing token → repository mechanism → reduced-motion result → status.
- Report each **exercised** when driven in a render, **code-reviewed** when only its code path was read against the thesis, **unjudged** when neither; only exercised is motion-verified.

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

- Keep durations and curves in tokens, and list a transition's properties instead of `all`.
- A focus indicator appears at once; a transition may animate properties around focus, never the indicator itself.
- Functional motion slows as it lands, with `cubic-bezier(.16, 1, .3, 1)` as the default ease-out. A signature sequence takes its curve from how the subject physically moves, because the default curve there reads as borrowed; a springy or elastic curve belongs only to a brief whose world truly bounces, never to a functional control.
- An element that appears and disappears, such as a panel, menu, dialog or toast, exits faster than it entered and on its own curve, never the entrance played in reverse.
- Declare that exit on the closed or leaving state itself: the entry keeps the longer duration token and the ease-out, and the exit takes a shorter duration token and an ease-in such as `cubic-bezier(.3, 0, .8, .15)`. A transition declared once on the base rule runs the same both ways, which is the reversed entrance the exit rule forbids.
- Hover and press feedback may use one transition on the base rule for both directions, as the chevron example under `## Reduced motion` does, because the release undoes a nudge rather than removing an element.
- **Duration derives from distance.** The larger the change in distance or size, the longer the animation takes, so a panel crossing the viewport and a chip nudging four pixels do not share one token. Verify: measure two travels of clearly different distance and confirm the longer one takes longer.

## Continuity contract

- **An interrupted animation starts from the current value**, never from the origin and never by snapping to the end. Verify: trigger, re-trigger at about half progress, and sample the next frame — it sits at the mid value, not at either end.
- **Reversal reverses from where it is**, with the remaining distance setting the remaining time. Verify: open then immediately close, and assert total travel is less than the full distance with no jump between consecutive frames.
- **Velocity carries across a handoff.** Physics springs take in the velocity of a running gesture or animation, while duration-based springs and tweens do not, so a gesture that releases into an animation needs one. Verify: per-frame delta stays continuous in sign and magnitude across the release, rather than collapsing to zero and rebuilding.
- **Gesture-driven motion tracks the pointer 1:1** during the drag and releases into momentum in the same direction.
- **Choreography declares its order.** An entrance sequence names its order and stagger.
- **Shared-element continuity means one object persists**, not one element fading out while another fades in. A persistent element connects the start and end state, related content moves on a shared axis, and unrelated content fades through. Verify: one node spans both states, with no simultaneous crossfade of two boxes.

## Scroll and view transitions

- Use CSS scroll timelines when the browser matrix supports them and the page stays complete without them; never steer wheel or scroll position.
- On narrative pages pin one or two sections at most, scrub tied to real content progression, and run reveals once. Parallax moves non-text imagery by at most 10% of scroll distance; a brief demanding more names the cost.
- Use view transitions only for elements persisting across a state or navigation change, naming only those.
- `@starting-style` plus discrete transitions handle supported dialog, popover, or display-state entry; final open and closed states work without animation.

## Judgment

- Prefer the platform, and use a repository's existing animation library idiomatically; add a library only for orchestration, physics, or scrubbed timelines CSS cannot express, never for one fade.
- Reduced-motion preference and interaction feedback outrank the thesis.
- One authored signature outranks scattered micro-effects.
- A brief's requested intensity outranks these caps; the accessibility floor outranks the brief.
- Existing repository motion tokens and browser targets outrank these values.
