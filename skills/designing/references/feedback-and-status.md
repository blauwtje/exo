# Feedback and Status

Report work in flight so waiting feels shorter than it is and no result is claimed before it is true. The enemy is the interface that goes silent under load and then asserts success it has not received. The overcorrection is status theater: a spinner for every keystroke, a toast for every save, a progress bar that arrives at 90% and stays.

`interaction-qa.md` decides which states a region can enter. This file decides the form and the timing of the ones that report work: waiting, provisional, and transient.

## Waiting has four durations, not one

The form follows the wait the surface expects, measured under the throttling `performance-budget.md` names, never the wait on a fast machine:

- **Under 100ms** — no indicator at all. The result is the feedback; anything added reads as a stutter.
- **100ms to 1s** — the control itself holds the state: pressed, busy, its label unchanged. Nothing new appears on screen, because a person still inside their own action has not started waiting yet.
- **1s to 10s** — a skeleton where the content will land, or a determinate bar where a real fraction is known. The surrounding page stays interactive unless the result invalidates it.
- **Past 10s** — the wait needs a job of its own: progress with a changing figure, a plain statement of what is running, and a way out that leaves the data consistent. A wait past ten seconds with no exit is a trap, not a state.

One rule cuts across all four. An indicator for an unpredictable wait appears no earlier than roughly 300ms, and once shown it stays for at least that long: a spinner that flashes and vanishes reads as a defect, and one that appears after the content has landed reads as a second failure. Record the threshold once per product, in a token, rather than per component.

## Skeletons stand in for a layout, not for content

- A skeleton mirrors the real geometry — the same block count, the same heights, the same rhythm — because its job is to reserve space so arrival shifts nothing (`performance-budget.md` owns the CLS measurement).
- It never shows a count the data has not confirmed: three skeleton rows followed by one real row is a worse answer than one skeleton row.
- It carries no text, no fake headings, and no ellipsis. Invented placeholder words are read as content by anyone skimming, and by every screen reader.
- Where the layout is unknown until the data arrives, use the determinate or indeterminate indicator instead: a skeleton for a shape nobody knows is a guess rendered at full opacity.
- Under `prefers-reduced-motion: reduce` the shimmer is replaced, not deleted (`motion.md`), because the shimmer is what distinguishes a loading block from an empty one.

## Provisional results are a contract, not an optimization

A change may render before the server confirms it only when all three hold:

1. the failure is recoverable in place, so a rollback restores exactly the prior state with nothing else already built on the wrong one;
2. the result does not depend on a value only the server knows — an id, a computed total, a rank, a permission, an inventory count;
3. the consequence of being wrong is a correction, not a loss.

Never provisional: a deletion, a payment, a transfer, a permission change, a send, or anything a regulator or an auditor would read. Those wait for the response and say so while waiting.

- A rolled-back change names what failed and what the value is now, in the same surface, and offers the retry (`interaction-qa.md` owns the error wording). Silent reversion teaches people to distrust every later confirmation.
- A provisional element reads as provisional while it is in flight: reduced emphasis, a pending mark, or its action disabled. Identical treatment for "saved" and "probably saved" is what makes the rollback feel like data loss.
- Queue provisional changes in order and apply them in order, because two optimistic edits resolving out of order leave the screen showing a state that never existed on either side.

## A transient message is a product-wide decision

Dwell, placement, stack depth, and whether it can dismiss itself are decided once for the product and then not per feature, because a toast that behaves differently in two places trains people to ignore both.

- Severity sets dwell: a neutral confirmation clears itself, a warning stays longer, and an error or a message carrying an action never auto-dismisses, since a message that leaves before it is read did not report anything.
- Place them in one region for the whole product, away from the primary action and away from the safe-area edges (`implementation.md`), and never over the control that triggered them.
- Cap the stack at roughly three and collapse the rest into a count. Past that the newest message covers the one still being read.
- A transient message is never the only record of something that matters. Anything a person may need again belongs in the surface it concerns, or in a place they can return to.
- It carries no focus move on arrival, and any action inside it is reachable by keyboard before it expires, or it is not a place for an action.
- Confirming an action the person can already see on screen needs no message at all: the row that disappeared reported itself.

## Announce what changed

Every state in this file is visual by default, which means silent. The programmatic half is WCAG 4.1.3 Status Messages in `accessibility.md`: waiting, progress, success, and error each need `role="status"`, `role="alert"`, or `aria-live` without moving focus, and a region still fetching carries `aria-busy` until it is not.

## Sweep

Against the render, at Phase 5:

- [ ] Force one slow response and confirm the indicator matches the duration band, appears no earlier than the recorded threshold, and does not outlive the content.
- [ ] Force one failure on a provisional change and confirm the value returns to its prior state, with a message and a retry in the same surface.
- [ ] Confirm no deletion, payment, permission change, or send renders as done before its response arrives.
- [ ] Trigger two transient messages and confirm the placement, the cap, and that the error among them does not dismiss itself.
- [ ] Confirm one waiting region and one completion are announced without focus moving.

## Judgment

- A truthful wait outranks a short-feeling one: no indicator misstates progress it does not have.
- The accessibility floor outranks the visual treatment of every state here.
- An existing repository convention for indicators and messages outranks these defaults; one convention chosen badly still beats two chosen well.
- `interaction-qa.md` owns which states exist; this file owns only how the reporting ones look and when they appear.
- Waiting outranks guessing: where the three provisional conditions do not all hold, the interface waits for the response and shows that it is waiting.
