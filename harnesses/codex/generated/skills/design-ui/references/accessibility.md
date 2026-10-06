# Accessibility

Prove behavior, not compliance. The enemy is the page that passes the automated scan and fails a person: zero violations, no keyboard path, no announcement, a dialog the scanner never opened.

Do not enumerate criteria in a report and build none of them.

## What automation proves, and what it never does

- An empty `violations` array proves nothing, because `incomplete` results were aborted and need manual checks.
- Report the scanned state, never the page: the scanner skips inactive menus and modal windows.
- Open the dialog, the menu and the disclosure, then scan again.
- Whole rule families are off by default: the WCAG 2.2 rules, the AAA rules, the experimental rules and the deprecated ones.
- Enable them deliberately or say which were not run.
- `resultTypes` is a speed option, not a filter: types left out cap at one node each, so a truncated report undercounts.
- Never write "accessible" from a scan; write "no automated violations in the states scanned" and name the manual checks done or not done.
- It detects missing alt, missing control names, ARIA validity, duplicate ids, document language, heading and landmark structure, resolvable text contrast, frame titles and list markup.
- It returns contrast as needs-review where the background cannot be resolved.
- It cannot judge whether a label is the right label, whether a criterion's exception applies, or anything behind a state it never entered.

## The criteria that carry numbers

- **1.4.12 Text Spacing** — the content survives line-height 1.5× the font size, paragraph spacing 2×, letter-spacing 0.12× and word-spacing 0.16×.
- Text spacing is about the overridden state, not the authored one.
- Verify text spacing by injecting the four values as a user stylesheet and diffing geometry for clipping and overlap.
- Fixed-height chips, buttons and single-line labels fail text spacing first.
- **1.4.10 Reflow** — the `phase-detail` reference `## The build floor` owns the 320×256 floor; run that check as well as the 360px one.
- **1.3.4 Orientation** — content does not lock to one display orientation unless that orientation is essential.
- Verify orientation by detecting orientation-locking CSS and rendering both ways.
- **4.1.3 Status Messages** — a status message (success, waiting, progress, error) reaches assistive technology through `role="status"`, `role="alert"` or `aria-live` without moving focus.
- Verify a status message by asserting the role or `aria-live` on the node and that focus did not move.
- **2.4.11 Focus Not Obscured (Minimum)** — a focused element is never entirely hidden by author-created content.
- Four fixed edges fail 2.4.11: a sticky header, a bottom action bar, a cookie banner and a floating chat launcher.
- Verify 2.4.11 by tabbing to the control directly beneath each fixed edge and asserting its focus ring is on screen.
- Fix 2.4.11 with `scroll-margin` on the focusable, sized to the sticky region, never by disabling smooth scrolling.
- **2.5.7 Dragging Movements** — every function operated by dragging has a single-pointer alternative that needs no drag, unless dragging is essential.
- A reorder list, a slider, a kanban column, a map pan and a resize handle each owe a tap or click path: arrows, a move-to menu, a numeric field or buttons.

## Keyboard contracts

Contracts follow the W3C ARIA Authoring Practices Guide.

- **Focus never falls to the body.** After a close, a delete or a route change, focus moves somewhere deliberate and visible.
- **Modal dialog** — on close, focus returns to the element that invoked it.
- **Modal dialog** — on open, focus moves inside.
- **Modal dialog** — Tab wraps from the last tabbable element to the first, Shift+Tab the reverse, and Escape closes.
- **Modal dialog** — `role="dialog"`, `aria-modal="true"`, and a name from `aria-labelledby` on a visible title.
- **Modal dialog** — verify by tabbing past the end and asserting the wrap, then pressing Escape and asserting focus is on the trigger.
- **Combobox** — DOM focus stays on the combobox while a listbox, grid or tree descendant is active through `aria-activedescendant`; only a dialog popup takes real focus.
- **Combobox** — the combobox is in the tab sequence; Down Arrow opens the popup or moves into it; Escape dismisses it and returns focus; Enter accepts the focused option.
- **Combobox** — `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-haspopup` matching the popup type, `aria-autocomplete` of `none`, `list` or `both`, and `aria-selected` on the selection.
- **Combobox** — verify by opening, pressing Down twice, and asserting `document.activeElement` is still the input and `aria-activedescendant` names the selected option.
- **Menu button** — Enter and Space open the menu and place real DOM focus on the first item, unlike the combobox.
- **Menu button** — `aria-haspopup` of `menu`, and `aria-expanded` while open.
- **Tabs** — the whole tab list is one tab stop landing on the active tab.
- **Tabs** — Left and Right (Up and Down when vertical) move and wrap; Space or Enter activates when activation is not automatic.
- **Tabs** — automatic activation on focus only when the panel displays without noticeable latency (the `performance-budget` reference).
- **Tabs** — a panel with no focusable content takes `tabindex="0"`.
- **Tabs** — verify by pressing ArrowRight past the last tab to see it wrap, and asserting exactly one tab has `aria-selected="true"`.
- **Disclosure** — Enter and Space toggle; `role="button"` with `aria-expanded`; focus stays on the control.
- **Disclosure** — verify by pressing Space and asserting `aria-expanded` flipped and `document.activeElement` did not.
- **Roving tabindex and `aria-activedescendant`** both make a composite one tab stop.
- **Roving tabindex** moves real focus, keeps `tabindex="0"` on the active item and `-1` on the rest, and remembers the last position when the composite loses focus.
- **`aria-activedescendant`** keeps focus on the container, and the combobox pattern requires it.

## Sweep

Exercised in the render, added to the interaction sweep in the `interaction-qa` reference:

- [ ] Scan each reachable state with dialogs and menus open, report which states were scanned, and never write "accessible" from a scan.
- [ ] 320×256 reflow: no two-dimensional scrolling, or the two-dimensional exception is named.
- [ ] Text-spacing override injected as a user stylesheet (line-height 1.5×, paragraph spacing 2×, letter-spacing 0.12×, word-spacing 0.16×): no clipping, no overlap, no lost action.
- [ ] Every composite widget on the surface answers its keyboard contract above.
- [ ] One status message reaches the accessibility tree through `role="status"`, `role="alert"` or `aria-live` without moving focus.
- [ ] Focus after closing the surface's dialog or disclosure is on the invoking element.

## Judgment

- A built and exercised behavior outranks a scan result in both directions: a clean scan proves little, a violation on an unreachable node is not a defect.
- Native semantics outrank a reconstructed widget; the APG contract outranks a bespoke keyboard scheme.
- Existing repository accessibility tooling, pinned rule sets and conventions outrank these defaults.
- Say what was not checked; an unrun check reported as a pass is worse than no check.
