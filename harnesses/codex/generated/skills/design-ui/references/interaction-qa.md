# Interaction and QA

Design the interface's behavior as deliberately as its surface. The enemy is the ideal-state interface: populated, enabled, pointer-driven, nothing loading and nothing failing. The overcorrection is process ceremony: flows documented, states enumerated, none of them built.

## The reachable-state inventory

First inventory which of loading, empty, error, success, disabled, permission and live states each region and fallible control can enter, from the repository, data model, workflow or brief. Build every reachable state, no unreachable one.

- **Loading**: reserves its space (arrival shifts no layout); covers every asynchronous action.
- **Empty**: one of three forms, written for the reason the region is empty:
  - *First use*: says what will live here, hands over the first action. ✗ "No projects found." ✓ "Projects you create will appear here." + [New project].
  - *No results or filtered*: keeps query and filters in the sentence, offers recovery. ✓ "No projects match “atlas” in Archived." + [Clear filters].
  - *Unavailable or restricted*: names what governs access or availability, never dressed as onboarding.
- **Error**: inline at the point of failure, in the interface's voice, no blame, no apology theater. Answers:
  - What happened, precisely; never "Something went wrong" when you know what did.
  - Why, only when the why changes what to do.
  - What next, as a recovery action in the same surface when the interface exposes one.
  - ✗ "Oops! Something went wrong." ✓ "Couldn't save: you're offline. Changes are kept on this device and will sync when you reconnect."
- **Success**: names the outcome, not "completed".
- **Disabled**: exists wherever an action can be unavailable; shows the reason where knowable.
- **Permission**: capability irrelevant or unavailable to this person → hidden; shown locked only when discoverability and a concrete recovery, upgrade or admin path matter.
- **Live**: names what updates and how attention is drawn (orientation job).

Floor beneath this inventory: hover and active on every pointer control, visible focus on every interactive control. Reachable state the build does not show = missing region; unreachable state built anyway = decoration.

## The task path

Name the primary task, its decision points, and the path from arrival to done. Primary action sits at the decision point, not page bottom. Name what happens right after success: where the person lands, what changed, what they can do next.

## Affordance and feedback

- Interactive elements read as interactive before touch: cursor, hover and pressed states distinguish them from static text.
- Every action acknowledges within one transition: state change, result or progress indicator.
- Continuity: element that appears or moves shows where it came from (continuity job, `motion` reference).
- Recovery deterministic: undo for safely reversible actions, confirmation for irreversible or high-impact ones, never both on one action.
- State transitions: 120–200ms on hover, focus, active; 200–400ms on open and close; easing tokens from the `motion` reference.

## Progressive disclosure

Defaults visible; secondary controls behind labeled disclosure. Build disclosure on native `details`, `dialog` and `popover` states (`implementation` reference) so open and closed are real states, not reconstructed.

Controls filter a result field → what is on stays visible without opening anything:

- every active filter → own removable chip beside the results, with live count of what survives; an unseen filter gets blamed on the data;
- option that would return nothing → shown disabled with zero count, not removed; a list reshuffling while read loses the reader's place;
- one action clears all at once, naming what it clears, not "Reset".

## Input modality

- **Keyboard:** every control reachable in DOM order, focus visible (quality floor), what opens closes with Escape, arrow keys inside composite widgets.
- **Coarse pointer:** target floor = `## The build floor` of the `phase-detail` reference (WCAG 2.2 AA 2.5.8 at 24×24 CSS px; AAA 2.5.5 at 44×44, default for a touch-first surface). No hover-only affordance: every hover-revealed action has a visible-on-touch equivalent.
- At 390px → re-verify disclosure patterns and primary action reachability.

## Pre-ship interaction sweep

Exercised in the render, not read in the source:

- [ ] Tab through the page: order = reading order, focus visible throughout?
- [ ] Trigger one reachable error state and one reachable empty state. Each one the surface cannot enter → mark not applicable, exercise another representative reachable state instead.
- [ ] Exercise one disclosure open and closed; none on the surface → not applicable; never add disclosure for this checklist.
- [ ] Check touch targets and hover-only affordances at the coarse-pointer width.
- [ ] Confirm feedback survives reduced motion.
- [ ] Exercise every motion in the bar of the `motion` reference, and its reduced-motion result.

## Judgment

- Built states outrank documented states.
- Native semantics outrank reconstructed widgets.
- Quality floor outranks visual polish on any control.
- Existing repository interaction patterns outrank these defaults.
