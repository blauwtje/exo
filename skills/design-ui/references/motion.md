# Motion

Choreograph motion as part of the direction, not a garnish. The enemy is unowned motion: scattered default effects and the uniform fade-up nobody chose. The overcorrection is motion that hides content, stalls a task, or survives reduced motion.

## Reduced motion

- Every CSS transition and animation → behind `@media (prefers-reduced-motion: no-preference)`; never the state it leads to. Motion app → wrap in `<MotionConfig reducedMotion="user">`; keeps opacity, drops transform and layout animation under `reduce`.
- `:hover` offset, `:active` press, open panel, selected tab → declare outside the query. Under `reduce` each state change still happens, instantly or as opacity or color change; no content or feedback lost.
- State change wrapped inside the query → deletes feedback. Same for blanket `* { animation: none; }` under `reduce` that stops a loading shimmer instead of replacing it with an opacity change.
- Rule covers CSS animations, scroll timelines, view transitions, media that plays by itself.

~~~css
.row:hover .chevron { transform: translateX(2px); }
@media (prefers-reduced-motion: no-preference) {
  .chevron { transition: transform var(--dur-feedback) var(--ease-out); }
}
~~~

- **Replace, do not delete.** Motion conveys meaning → swap for a non-moving animation: dissolve, fade, color shift. Verify under `reduce`: state change still animates on opacity or color; translation, scale, parallax measure approximately zero.
- Depth simulation, parallax, animated blur, multi-axis and spinning motion, auto-advancing motion → disable or change outright.
- Mask or gradient fade marking an edge (e.g. end of a scrolling rail) → not motion, unchanged under `reduce`. Only a mask whose position or size animates stops, at its final state.
- **Media query = default, not whole answer.** Surface carries ambient motion or autoplay → ship an in-product motion setting, initial value from `prefers-reduced-motion`, overridable either way. Setting drives the same token or class as the media query: one code path.

## Motion thesis

Write the thesis as one sentence before the first animation: how the chosen mood moves. Every screen carries this whole bar, each item in a home the scope gives it; rich motion is a level, not a look:

- regions enter staggered from their container, focal region first, content visible at rest;
- key figures count up to their value on first view;
- tabs, segmented controls and navigation move the active mark with a sliding indicator;
- section or view switch morphs through Motion's `AnimatePresence` and `layout` where the project uses Motion, else calls `document.startViewTransition()` around its DOM change, not only `view-transition-name`, so persisting elements morph;
- detail, filter or edit panel slides in from its edge and leaves faster;
- hover, focus, active and open states transition at every size, on every control.

## Job gate

One primary job per animation; secondary job only when it changes implementation or critique:

1. **Continuity:** show where an element came from or went.
2. **Feedback:** confirm an action or state change.
3. **Orientation:** direct attention to the element that changed.
4. **Atmosphere:** ambient background movement tied to the `visual-direction` reference's ground. Optional, never carrying content, static under reduced motion, paused off-screen, within that file's material and blur limits.

- Animation with no listed job → cut; every motion in the bar has one.
- Record every planned sequence as trigger → target/state → job → timing token → repository mechanism → reduced-motion result → status.
- Report each **exercised** when driven in a render, **code-reviewed** when only its code path was read against the thesis, **unjudged** when neither; only exercised is motion-verified.

## Materials

Pick the mechanism for what the motion means, never out of habit:

| The motion means | Reach for |
|---|---|
| An element persists across a state or page change | view transitions, FLIP, a shared element |
| Something moves forward in depth or out of focus | blur, `backdrop-filter`, stacked shadows |
| Content is being uncovered | `clip-path`, `mask`, opacity in steps |
| The content is live, such as a feed, a stream or a running process | canvas or generative motion |

Default: animate `transform` and `opacity`; add blur, `clip-path`, `mask` or shadow only where target devices keep them smooth.

## Timing

| Motion | Duration |
|---|---|
| Response to a press, toggle or hover | 120–200ms |
| A panel, dropdown or card changing state | 200–400ms |
| A staged entrance or a count-up | 400–800ms |
| The delay between siblings in a stagger | 30–80ms, with the whole sequence inside 800ms |

- Durations and curves → tokens. List a transition's properties instead of `all`, Tailwind's `transition-all` in a fetched component included.
- Focus indicator appears at once; transition may animate properties around focus, never the indicator itself.
- Functional motion default ease-out: `cubic-bezier(.16, 1, .3, 1)` or a Motion spring without bounce; staged entrance → curve from the mood's motion feel; overshoot only for the friendly and playful mood or a bouncing brief, never a functional control.
- Element that appears and disappears (panel, menu, dialog, toast) → exits faster than it entered, on its own curve, never the entrance reversed.
- Declare that exit on the closed or leaving state itself, or in Motion's `exit`: entry keeps the longer duration token and ease-out; exit takes a shorter duration token and an ease-in such as `cubic-bezier(.3, 0, .8, .15)`. Transition declared once on the base rule runs the same both ways = the reversed entrance the exit rule forbids.
- Hover and press feedback → one transition on the base rule for both directions is fine, as the chevron example under `## Reduced motion` does; release undoes a nudge, removes no element.
- **Duration derives from distance.** Larger change in distance or size → longer animation; a panel crossing the viewport and a chip nudging four pixels do not share one token. Verify: measure two travels of clearly different distance, confirm the longer takes longer.

## Continuity contract

- **Interrupted animation starts from the current value**, never from the origin, never by snapping to the end. Verify: trigger, re-trigger at about half progress, sample next frame: it sits at the mid value, not either end.
- **Reversal reverses from where it is**; remaining distance sets remaining time. Verify: open then immediately close, assert total travel < full distance, no jump between consecutive frames.
- **Velocity carries across a handoff.** Physics springs take in the velocity of a running gesture or animation; duration-based springs and tweens do not, so a gesture releasing into an animation needs a physics spring. Verify: per-frame delta stays continuous in sign and magnitude across the release, not collapsing to zero and rebuilding.
- **Gesture-driven motion tracks the pointer 1:1** during the drag, releases into momentum in the same direction.
- **Choreography declares its order.** Entrance sequence names its order and stagger.
- **Shared-element continuity = one object persists**, not one element fading out while another fades in: persistent element connects start and end state; related content moves on a shared axis; unrelated content fades through. Verify: one node spans both states, no simultaneous crossfade of two boxes.

## Scroll and view transitions

- CSS scroll timelines → only when the browser matrix supports them and the page stays complete without them; never steer wheel or scroll position.
- Narrative pages → pin one or two sections at most, scrub tied to real content progression, run reveals once. Parallax → non-text imagery only, at most 10% of scroll distance; brief demanding more names the cost.
- View transitions → only for elements persisting across a state or navigation change; name only those.
- `@starting-style` plus discrete transitions → supported dialog, popover or display-state entry; final open and closed states work without animation.

## Judgment

- Use the project's animation library idiomatically; default stack of the `stack` reference = Motion. No library → prefer the platform; add one only for orchestration, physics, or scrubbed timelines CSS cannot express, never for one fade.
- Reduced-motion preference and interaction feedback outrank the thesis.
- Brief's requested intensity outranks these caps; accessibility floor outranks the brief.
- Existing repository motion tokens and browser targets outrank these values.
