# Interaction and QA

Design the interface's behavior as deliberately as its surface. The enemy is the ideal-state interface — populated, enabled, pointer-driven, nothing loading and nothing failing. The overcorrection is process ceremony: flows documented, states enumerated, none of them built.

## The task path

Name the primary task, its decision points, and the path from arrival to done. The primary action sits at the decision point, not at the page bottom. Name what happens immediately after success: where the person lands, what changed, what they can do next.

## Affordance and feedback

- Interactive elements read as interactive before they are touched: cursor, hover, and pressed states distinguish them from static text.
- Every action acknowledges within one transition — a state change, a result, or a progress indicator.
- Continuity: an element that appears or moves shows where it came from (the continuity job in `motion.md`).
- Recovery is deterministic: undo for safely reversible actions, confirmation for irreversible or high-impact ones, never both on one action.
- Every error surface carries its own recovery action, in the wording below.
- State transitions run 120–200ms on hover, focus, and active, and 200–400ms on open and close, from the easing tokens (`motion.md`).

## Progressive disclosure

Defaults stay visible; secondary controls sit behind labeled disclosure. Build disclosure on native `details`, `dialog`, and `popover` states (`implementation.md`) so open and closed are real states, not reconstructed ones.

## The reachable-state inventory

First inventory which of loading, empty, error, success, disabled, permission, and live states each region and fallible control can enter — from the repository, data model, workflow, or brief. Build every reachable state and no unreachable one.

- **Loading** reserves its space, so arrival shifts no layout, and covers every asynchronous action.
- **Empty** takes one of three forms, each written for the reason the region is empty. *First use* says what will live here and hands over the first action: ✗ "No projects found." ✓ "Projects you create will appear here." + [New project]. *No results or filtered* keeps the query and filters in the sentence and offers recovery: ✓ "No projects match “atlas” in Archived." + [Clear filters]. *Unavailable or restricted* names what governs access or availability, never dressed as onboarding.
- **Error** is inline at the point of failure and answers three questions in the interface's voice, without blame and without apology theater: what happened — precisely, never "Something went wrong" when you know what did; why, only when the why changes what to do; and what to do next, as a recovery action in the same surface when the interface exposes one. ✗ "Oops! Something went wrong." ✓ "Couldn't save — you're offline. Changes are kept on this device and will sync when you reconnect."
- **Success** names the outcome rather than announcing completion.
- **Disabled** shows the reason where the reason is knowable, and exists wherever an action can be unavailable.
- **Permission** hides a capability irrelevant or unavailable to this person, and shows it locked only when discoverability and a concrete recovery, upgrade, or admin path matter.
- **Live** names what updates and how attention is drawn (the orientation job).

Hover and active belong to every pointer control, and visible focus to every interactive control, as the floor beneath this inventory. A reachable state the build does not show is a missing region; an unreachable state built anyway is decoration.

## Input modality

- **Keyboard:** every control reachable in DOM order, focus visible (the quality floor), what opens closes with Escape, arrow keys inside composite widgets.
- **Coarse pointer:** the target floor is the Phase 3 floor in SKILL.md (WCAG 2.2 AA 2.5.8 at 24×24 CSS px, AAA 2.5.5 at 44×44, the default for a touch-first surface). No hover-only affordance: any hover-revealed action has a visible-on-touch equivalent.
- At 390px, re-verify the disclosure patterns and the primary action's reachability.

## Pre-ship interaction sweep

Exercised in the render, not read in the source:

- [ ] Tab through the page: is the order the reading order, and is focus visible throughout?
- [ ] Trigger one reachable error state and one reachable empty state. Mark each one the surface cannot enter as not applicable and exercise another representative reachable state in its place.
- [ ] Exercise one disclosure open and closed, marking it not applicable where the surface has none; never add disclosure for this checklist.
- [ ] Check touch targets and hover-only affordances at the coarse-pointer width.
- [ ] Confirm feedback survives reduced motion.
- [ ] Exercise the recorded motion decision by its route — signature: the planned sequence; feedback-only: representative interaction feedback; stillness: confirm no signature or ambient choreography was added, then exercise functional feedback alone and report stillness held, never motion-verified.

## Judgment

- Built states outrank documented states.
- Native semantics outrank reconstructed widgets.
- The quality floor outranks visual polish on any control.
- Existing repository interaction patterns outrank these defaults.
