# Feedback and Status

Report work in flight so waiting feels shorter and no result is claimed before it is true. The enemy is the interface that goes silent under load, then asserts success it has not received. The overcorrection is status theater: a spinner for every keystroke, a toast for every save, a progress bar that reaches 90% and stays.

Split: the `interaction-qa` reference decides which states a region can enter; this file decides form and timing of the ones that report work: waiting, provisional, transient.

## Waiting has four durations, not one

Form follows the expected wait, measured under the throttling the `performance-budget` reference names, never on a fast machine:

- **Under 100ms:** no indicator. The result is the feedback; anything added reads as a stutter.
- **100ms to 1s:** the control itself holds the state (pressed, busy, label unchanged). Nothing new appears on screen.
- **1s to 10s:** skeleton where the content will land, or a determinate bar where a real fraction is known. Surrounding page stays interactive unless the result invalidates it.
- **Past 10s:** the wait gets a job of its own: progress with a changing figure, a plain statement of what is running, and a way out that leaves the data consistent. No exit → a trap, not a state.

Across all four:

- Unpredictable wait → indicator appears no earlier than roughly 300ms, and once shown stays at least that long.
- A spinner that flashes and vanishes reads as a defect; one appearing after the content landed reads as a second failure.
- Threshold → recorded once per product, in a token, not per component.

## Provisional results

Render a change before the server confirms it only when all three hold:

1. Failure is recoverable in place: rollback restores exactly the prior state, with nothing else already built on the wrong one.
2. Result does not depend on a value only the server knows (id, computed total, rank, permission, inventory count).
3. Being wrong costs a correction, not a loss.

- Never render as done before the response: deletion, payment, transfer, permission change, send, or anything a regulator or auditor would read. These wait for the response and say so while waiting.
- Any of the three conditions fails → wait for the response and show the wait.
- Rolled-back change → names what failed and the current value, in the same surface, and offers the retry (the `interaction-qa` reference owns the error wording). No silent reversion.
- Provisional element in flight → reads as provisional: reduced emphasis, a pending mark, or its action disabled; "saved" and "probably saved" never look identical.
- Provisional changes → queue and apply in order; two optimistic edits resolving out of order show a state that never existed on either side.

## Skeletons stand in for a layout, not for content

- Skeleton → mirrors the real geometry (same block count, heights, rhythm) so arrival shifts nothing (the `performance-budget` reference owns the CLS measurement).
- Never shows a count the data has not confirmed: three skeleton rows then one real row is worse than one skeleton row.
- No text, no fake headings, no ellipsis; invented placeholder words read as content to skimmers and every screen reader.
- Layout unknown until the data arrives → determinate or indeterminate indicator instead of a skeleton.
- `prefers-reduced-motion: reduce` → shimmer replaced, not deleted (the `motion` reference); the shimmer distinguishes a loading block from an empty one.

## A transient message is a product-wide decision

Dwell, placement, stack depth and self-dismissal → decided once for the product, not per feature; a toast behaving differently in two places trains people to ignore both.

- Severity sets dwell: neutral confirmation clears itself, a warning stays longer, an error or a message carrying an action never auto-dismisses.
- Placement → one region product-wide, away from the primary action and the safe-area edges (the `implementation` reference), never over the triggering control.
- Stack → cap at roughly three, collapse the rest into a count.
- A transient message is never the only record of something that matters; anything needed again belongs in its surface or a place the person can return to.
- No focus move on arrival; any action inside is keyboard-reachable before it expires, or the message holds no action.
- Result of an action already visible on screen (the row disappeared) → no confirming message.

## Announce what changed

Every state here is visual, so silent by default. Programmatic half: WCAG 4.1.3 Status Messages in the `accessibility` reference. Waiting, progress, success and error each need `role="status"`, `role="alert"` or `aria-live` without moving focus; a region still fetching carries `aria-busy` until done.

## Sweep

Against the render, at Phase 5:

- [ ] Force one slow response: indicator matches the duration band, appears no earlier than the recorded threshold, does not outlive the content.
- [ ] Force one failure on a provisional change: value returns to its prior state, with a message and a retry in the same surface.
- [ ] No deletion, payment, permission change or send renders as done before its response arrives.
- [ ] Trigger two transient messages: placement, cap, and the error among them does not dismiss itself.
- [ ] One waiting region and one completion are announced without focus moving.

## Judgment

- A truthful wait outranks a short-feeling one: no indicator misstates progress it does not have.
- The accessibility floor outranks the visual treatment of every state here.
- An existing repository convention for indicators and messages outranks these defaults; one convention chosen badly still beats two chosen well.
